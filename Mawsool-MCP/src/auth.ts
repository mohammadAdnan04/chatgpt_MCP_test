import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { recordToolLog } from "./toolLogs.js";

const TOOL_BY_PATH: Record<string, string> = {
  search: "search",
  contact: "contact-only",
  "full-info": "full-info-without-contact",
  "save-to-list": "save-to-list",
  credits: "check-credits",
};

function toolEmail(auth: AuthInfo | null | undefined): string | null {
  const email = auth?.extra?.email;
  return typeof email === "string" && email ? email : null;
}

function jsonClone(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return { _unserializable: true, preview: String(value).slice(0, 500) };
  }
}

/** Coolify stdout (one line) + in-memory store for GET /logs. */
function logToolCall(fields: {
  tool: string;
  email: string | null;
  clientId?: string;
  ms: number;
  isError: boolean;
  req: unknown;
  res: unknown;
  path?: string;
}) {
  const entry = recordToolLog({
    tool: fields.tool,
    email: fields.email,
    clientId: fields.clientId || null,
    ms: fields.ms,
    isError: fields.isError,
    path: fields.path || null,
    req: jsonClone(fields.req),
    res: jsonClone(fields.res),
  });
  console.log(JSON.stringify(entry));
}

async function withToolLog<T>(
  tool: string,
  auth: AuthInfo | null | undefined,
  req: unknown,
  path: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    const record = result as { data?: unknown; isError?: boolean; error?: unknown };
    const isError =
      typeof record?.isError === "boolean" ? record.isError : Boolean(record?.error);
    const res = record?.data !== undefined ? record.data : result;
    logToolCall({
      tool,
      email: toolEmail(auth),
      clientId: auth?.clientId,
      ms: Date.now() - started,
      isError,
      req,
      res,
      path,
    });
    return result;
  } catch (err: any) {
    logToolCall({
      tool,
      email: toolEmail(auth),
      clientId: auth?.clientId,
      ms: Date.now() - started,
      isError: true,
      req,
      res: { error: err?.message || String(err) },
      path,
    });
    throw err;
  }
}

/** Claude Coolify must not set AUTH_ISSUER. ChatGPT Coolify sets AUTH_ISSUER=Auth0. */
export function isChatgptAuth(): boolean {
  return Boolean(String(process.env.AUTH_ISSUER || "").trim());
}

export function getClaudeIssuer(): string {
  return (
    process.env.OAUTH_ISSUER ||
    process.env.AUTH_SERVER_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

export function getChatgptIssuer(): string {
  return String(process.env.AUTH_ISSUER || "").trim();
}

export function getWebsiteUrl(): string {
  const raw =
    process.env.WEBSITE_URL ||
    process.env.OAUTH_ISSUER ||
    process.env.AUTH_SERVER_URL ||
    "http://localhost:8000";
  return String(raw).trim().replace(/\/+$/, "");
}

function getInternalSecret(): string {
  const v = String(process.env.CHATGPT_MCP_INTERNAL_SECRET || "").trim();
  if (!v) throw new InvalidTokenError("missing CHATGPT_MCP_INTERNAL_SECRET");
  return v;
}

function getMcpResourceUrl(): string {
  const server = (
    process.env.SERVER_URL ||
    process.env.MCP_SERVER_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  return (process.env.MCP_RESOURCE_URL || `${server}/mcp`).replace(/\/+$/, "");
}

function getAuthAudience(): string {
  const v = String(process.env.AUTH_AUDIENCE || "").trim();
  return v || getMcpResourceUrl();
}

function getJwksUrl(): string {
  const override = String(process.env.AUTH_JWKS_URL || "").trim();
  if (override) return override;
  return `${getChatgptIssuer().replace(/\/+$/, "")}/.well-known/jwks.json`;
}

let jwks: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(getJwksUrl()));
  }
  return jwks;
}

function issuerCandidates(issuer: string): string[] {
  const trimmed = issuer.replace(/\/+$/, "");
  return [...new Set([issuer, trimmed, `${trimmed}/`])];
}

function emailFromPayload(payload: Record<string, unknown>): string | null {
  const direct = payload.email;
  if (typeof direct === "string" && direct.includes("@")) {
    return direct.trim().toLowerCase();
  }
  for (const [key, value] of Object.entries(payload)) {
    if (
      (key.endsWith("/email") || key === "https://mawsool.tech/email") &&
      typeof value === "string" &&
      value.includes("@")
    ) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

async function verifyChatgptJwt(token: string): Promise<AuthInfo> {
  const issuer = getChatgptIssuer();
  const audience = getAuthAudience();
  const resource = getMcpResourceUrl();
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, getJwks(), {
      issuer: issuerCandidates(issuer),
      audience: [...new Set([audience, resource])],
      clockTolerance: 5,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err: any) {
    throw new InvalidTokenError(err?.message || "invalid access token");
  }

  const email = emailFromPayload(payload);
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new InvalidTokenError("missing sub claim");
  if (!email) {
    throw new InvalidTokenError("missing email claim — enable email on the Auth0 access token");
  }
  const scope = typeof payload.scope === "string" ? payload.scope : "";
  return {
    token,
    clientId: String(payload.azp || payload.client_id || ""),
    scopes: scope.split(/\s+/).filter(Boolean),
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    extra: { sub, email, aud: payload.aud },
  };
}

async function verifyClaudeOpaque(token: string): Promise<AuthInfo> {
  const issuer = getClaudeIssuer();
  const response = await fetch(`${issuer}/oauth/introspect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ token }).toString(),
  });

  if (!response.ok) {
    throw new InvalidTokenError("introspection failed");
  }

  const data = (await response.json()) as {
    active?: boolean;
    sub?: string;
    client_id?: string;
    scope?: string;
    exp?: number;
    email?: string;
    aud?: string;
  };

  if (!data.active || !data.sub) {
    throw new InvalidTokenError("inactive or invalid token");
  }

  return {
    token,
    clientId: data.client_id || "",
    scopes: typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [],
    expiresAt: data.exp,
    extra: {
      sub: data.sub,
      email: data.email,
      aud: data.aud,
    },
  };
}

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  if (isChatgptAuth()) return verifyChatgptJwt(token);
  return verifyClaudeOpaque(token);
}

async function websiteInternal(
  auth: AuthInfo | null | undefined,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  const email = auth?.extra?.email as string | undefined;
  if (!email) {
    return { data: { error: "Not authenticated" }, isError: true };
  }
  try {
    const response = await fetch(`${getWebsiteUrl()}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Mawsool-Internal-Secret": getInternalSecret(),
        "X-Mawsool-User-Email": email,
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({
      error: `Invalid response (${response.status})`,
    }));
    if (!response.ok) {
      return {
        data: {
          ...data,
          error:
            data.error_description ||
            data.error ||
            data.message ||
            `Request failed (${response.status})`,
        },
        isError: true,
      };
    }
    return { data, isError: !!data.error };
  } catch (e: any) {
    return { data: { error: e.message || "Website request failed" }, isError: true };
  }
}

/** Read balance from website wallet only. */
export async function fetchAccountCredits(auth?: AuthInfo | null) {
  return withToolLog("check-credits", auth, {}, "credits", async () => {
    if (isChatgptAuth()) {
      const { data, isError } = await websiteInternal(auth, "GET", "/api/internal/mcp/credits");
      if (isError) return { error: data.error || "Failed to load credits" };
      return data;
    }

    const accessToken = auth?.token;
    if (!accessToken) return { error: "Not authenticated" };
    const issuer = getClaudeIssuer();

    try {
      const response = await fetch(`${issuer}/api/oauth/credits`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { error: data.error || `Failed to load credits (${response.status})` };
      }
      return data;
    } catch (e: any) {
      return { error: e.message || "Failed to load credits" };
    }
  });
}

/**
 * Forward tool call to website. MCP never calls Apicool and never computes prices.
 */
export async function callWebsite(
  auth: AuthInfo | null | undefined,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: any; isError: boolean }> {
  const tool = TOOL_BY_PATH[path] || path;
  return withToolLog(tool, auth, body || {}, path, async () => {
    if (isChatgptAuth()) {
      return websiteInternal(auth, "POST", `/api/internal/mcp/${path}`, body);
    }

    const accessToken = auth?.token;
    if (!accessToken) {
      return { data: { error: "Not authenticated" }, isError: true };
    }
    const issuer = getClaudeIssuer();

    try {
      const response = await fetch(`${issuer}/api/oauth/mcp/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body || {}),
      });

      const data = await response.json().catch(() => ({
        error: `Invalid response (${response.status})`,
      }));

      if (!response.ok) {
        return {
          data: {
            ...data,
            error:
              data.error_description ||
              data.error ||
              data.message ||
              `Request failed (${response.status})`,
          },
          isError: true,
        };
      }

      return { data, isError: !!data.error };
    } catch (e: any) {
      return { data: { error: e.message || "Website request failed" }, isError: true };
    }
  });
}
