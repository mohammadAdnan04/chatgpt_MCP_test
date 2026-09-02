import { timingSafeEqual } from "node:crypto";
import { McpServer } from "skybridge/server";
import { z } from "zod";
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  verifyAccessToken,
  fetchAccountCredits,
  callWebsite,
  isChatgptAuth,
  getClaudeIssuer,
  getChatgptIssuer,
} from "./auth.js";
import { clearToolLogs, listToolLogs } from "./toolLogs.js";

const CHATGPT_MODE = isChatgptAuth();
const AUTH_ISSUER = CHATGPT_MODE ? getChatgptIssuer() : getClaudeIssuer();

const SERVER_URL = (
  process.env.SERVER_URL ||
  process.env.MCP_SERVER_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

const MCP_RESOURCE_URL = (
  process.env.MCP_RESOURCE_URL || `${SERVER_URL}/mcp`
).replace(/\/+$/, "");

const PROTECTED_RESOURCE_DOC = {
  resource: MCP_RESOURCE_URL,
  authorization_servers: [AUTH_ISSUER],
  scopes_supported: ["mcp", "offline_access"],
  bearer_methods_supported: ["header"],
};

function toolResult(data: any, isError: boolean) {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

// MCP = OAuth + forward to website only.
// Website owns Apicool key, search engine, wallet, and revealBilling morphology.

const AUTH_REQUIRED =
  String(process.env.MCP_AUTH_REQUIRED || "true").toLowerCase() !== "false";

const AS_METADATA = CHATGPT_MODE
  ? {
      issuer: AUTH_ISSUER,
      authorization_endpoint: `${AUTH_ISSUER.replace(/\/+$/, "")}/authorize`,
      token_endpoint: `${AUTH_ISSUER.replace(/\/+$/, "")}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      scopes_supported: ["mcp", "offline_access"],
      client_id_metadata_document_supported: true,
    }
  : {
      issuer: AUTH_ISSUER,
      authorization_endpoint: `${AUTH_ISSUER}/oauth/authorize`,
      token_endpoint: `${AUTH_ISSUER}/oauth/token`,
      registration_endpoint: `${AUTH_ISSUER}/oauth/register`,
      revocation_endpoint: `${AUTH_ISSUER}/oauth/revoke`,
      introspection_endpoint: `${AUTH_ISSUER}/oauth/introspect`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: ["mcp", "offline_access"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    };

function isDiscoveryGet(req: any, ...paths: string[]) {
  if (req.method !== "GET") return false;
  const p = String(req.path || "");
  const u = String(req.url || "").split("?")[0];
  return paths.some((x) => p === x || u === x);
}

let server = new McpServer(
  {
    name: "MawsoolContactServer",
    version: "1.0.0",
  },
  { capabilities: {} },
)
  // Claude: PRM + redirect AS metadata to backbeta (unchanged).
  // ChatGPT: PRM points at Auth0; serve Auth0 metadata here (never backbeta).
  .use((req: any, res: any, next: any) => {
    if (
      isDiscoveryGet(
        req,
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
        "/mcp/.well-known/oauth-protected-resource",
      )
    ) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(PROTECTED_RESOURCE_DOC);
      return;
    }
    if (
      isDiscoveryGet(
        req,
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-authorization-server/mcp",
        "/mcp/.well-known/oauth-authorization-server",
        "/.well-known/openid-configuration",
        "/.well-known/openid-configuration/mcp",
        "/mcp/.well-known/openid-configuration",
      )
    ) {
      if (CHATGPT_MODE) {
        const issuerBase = AUTH_ISSUER.replace(/\/+$/, "");
        const urls = [
          `${issuerBase}/.well-known/oauth-authorization-server`,
          `${issuerBase}/.well-known/openid-configuration`,
        ];
        (async () => {
          for (const url of urls) {
            try {
              const hit = await fetch(url, { headers: { accept: "application/json" } });
              if (!hit.ok) continue;
              const doc = await hit.json();
              if (doc?.issuer && doc?.token_endpoint) {
                res.setHeader("Content-Type", "application/json");
                res.status(200).json(doc);
                return;
              }
            } catch {
              // try next
            }
          }
          res.status(502).json({ error: "server_error" });
        })();
        return;
      }
      const path = String(req.path || req.url || "").split("?")[0];
      const target = path.includes("openid-configuration")
        ? `${AUTH_ISSUER}/.well-known/openid-configuration`
        : path.endsWith("/mcp") || path.includes("/oauth-authorization-server/mcp")
          ? `${AUTH_ISSUER}/.well-known/oauth-authorization-server/mcp`
          : `${AUTH_ISSUER}/.well-known/oauth-authorization-server`;
      res.redirect(302, target);
      return;
    }
    next();
  })
  .use(
    mcpAuthMetadataRouter({
      oauthMetadata: AS_METADATA,
      resourceServerUrl: new URL(MCP_RESOURCE_URL),
    }),
  );

function logsSecretOk(req: any): boolean {
  const expected = String(process.env.MCP_LOGS_SECRET || "").trim();
  if (!expected) return false;
  const header = String(req.headers["x-mawsool-logs-secret"] || "").trim();
  const query = String(req.query?.secret || "").trim();
  const bearer = String(req.headers.authorization || "").startsWith("Bearer ")
    ? String(req.headers.authorization).slice(7).trim()
    : "";
  const provided = header || query || bearer;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function sendPrettyJson(res: any, status: number, body: unknown) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(`${JSON.stringify(body, null, 2)}\n`);
}

function attachMcpCors(req: any, res: any, next: any) {
  const origin = String(req.headers.origin || "");
  const allowOrigin = origin || "*";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  if (origin) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    [
      "Authorization",
      "Content-Type",
      "Accept",
      "Mcp-Session-Id",
      "MCP-Session-Id",
      "Mcp-Protocol-Version",
      "Last-Event-ID",
      "Last-Event-Id",
    ].join(", "),
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Session-Id");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

// ChatGPT (browser) sends CORS preflight OPTIONS before POST/GET.
// Bearer auth must NOT run on OPTIONS or the preflight 401s and ChatGPT aborts.
server = server.use("/mcp", attachMcpCors);
server = server.use("/sse", attachMcpCors);

// ChatGPT sometimes sends Accept: application/json only. Skybridge/SDK requires
// both application/json and text/event-stream on POST — normalize before auth/handler.
server = server.use("/mcp", (req: any, _res: any, next: any) => {
  if (req.method === "POST") {
    const accept = String(req.headers.accept || "");
    if (
      !accept.includes("application/json") ||
      !accept.includes("text/event-stream")
    ) {
      req.headers.accept = "application/json, text/event-stream";
    }
  }
  next();
});

if (AUTH_REQUIRED) {
  // Prefer root PR metadata URL in WWW-Authenticate (Claude Directory discovery)
  const resourceMetadataUrl = `${SERVER_URL}/.well-known/oauth-protected-resource`;
  const bearer = requireBearerAuth({
    verifier: { verifyAccessToken },
    requiredScopes: [],
    resourceMetadataUrl,
  });
  server = server.use("/mcp", bearer);
  server = server.use("/sse", bearer);
  console.log(
    CHATGPT_MODE
      ? `[Mawsool-MCP] ChatGPT JWT mode. issuer=${AUTH_ISSUER} resource=${MCP_RESOURCE_URL}`
      : `[Mawsool-MCP] Claude Bearer auth ON. Tools proxy → ${AUTH_ISSUER}/api/oauth/mcp/*`,
  );
} else {
  console.log(
    "[Mawsool-MCP] MCP_AUTH_REQUIRED=false — local DevTools can connect without OAuth.",
  );
}

server = server
  .registerTool(
    {
      name: "check-credits",
      description:
        "Returns Mawsool website account wallet credits for the signed-in user.",
      inputSchema: {},
      outputSchema: z
        .object({
          creditsRemaining: z.number().optional(),
          error: z.string().optional(),
        })
        .passthrough(),
      annotations: {
        title: "Check Mawsool Credits",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_input, extra) => {
      const result = await fetchAccountCredits(extra.authInfo || null);
      const text =
        typeof result.creditsRemaining === "number"
          ? `You have ${result.creditsRemaining.toLocaleString()} Mawsool account credits remaining.`
          : JSON.stringify(result, null, 2);
      return {
        structuredContent: result,
        content: [{ type: "text" as const, text }],
        isError: !!result.error,
      };
    },
  )

  .registerTool(
    {
      name: "search",
      description:
        "Search B2B profiles/companies via Mawsool website. Browse costs 0 wallet credits but uses the website daily search quota. Max 25 results per call (same as website page size). For more results, call again with page=2,3… — each page is one search.",
      inputSchema: {
        filters: z.record(z.string(), z.any()).describe("Search filters."),
        search_type: z
          .string()
          .default("people")
          .describe("'people' or 'companies'."),
        page: z
          .number()
          .default(1)
          .describe("1-based page. Each page counts as one daily search."),
        limit: z
          .number()
          .default(10)
          .describe(
            "Results per page. Capped at 25 (website page size). Do not request 100+ in one call.",
          ),
      },
      outputSchema: z.object({}).passthrough(),
      annotations: {
        title: "Search B2B Records",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ filters, search_type, page, limit }, extra) => {
      const { data, isError } = await callWebsite(extra.authInfo, "search", {
        filters,
        search_type,
        page,
        limit,
      });
      return toolResult(data, isError);
    },
  )

  .registerTool(
    {
      name: "contact-only",
      description:
        "Reveal LinkedIn contact info via Mawsool website. Credits follow website reveal rules (email 5 / phone 20 only when billable). Also marks the profile as revealed and saves it to the user's 'saved leads' list (same as the website).",
      inputSchema: {
        url: z.string().url().describe("LinkedIn profile URL."),
        fields: z
          .string()
          .min(1)
          .describe("Comma-separated fields, e.g. 'email,phone'."),
        country: z.string().optional(),
      },
      outputSchema: z.object({}).passthrough(),
      annotations: {
        title: "Reveal Contact Info",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ url, fields, country }, extra) => {
      const { data, isError } = await callWebsite(extra.authInfo, "contact", {
        url,
        fields,
        country,
      });
      return toolResult(data, isError);
    },
  )

  .registerTool(
    {
      name: "full-info-without-contact",
      description:
        "LinkedIn profile organizational lookup via Mawsool website (no SaaS contact reveal charge).",
      inputSchema: {
        url: z.string().url().describe("LinkedIn profile URL."),
      },
      outputSchema: z.object({}).passthrough(),
      annotations: {
        title: "Lookup Profile Organization",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url }, extra) => {
      const { data, isError } = await callWebsite(extra.authInfo, "full-info", {
        url,
      });
      return toolResult(data, isError);
    },
  )

  .registerTool(
    {
      name: "save-to-list",
      description:
        "Save one or more LinkedIn profiles into a Mawsool website list (same as Add to list). Does not run automatically on search — only when the user asks to save. Pass list_name (creates list if missing) or list_id. Copy first_name, last_name, title, company, and headline from search results when available so the website list columns fill in.",
      inputSchema: {
        list_name: z
          .string()
          .optional()
          .describe("Target list name, e.g. 'Outreach Q1'. Created if missing."),
        list_id: z
          .string()
          .optional()
          .describe("Existing Mawsool list id (if known)."),
        create_if_missing: z
          .boolean()
          .optional()
          .describe("Create list_name when it does not exist (default true)."),
        profiles: z
          .array(
            z
              .object({
                url: z.string().url().describe("LinkedIn profile URL."),
                name: z.string().optional().describe("Full name."),
                first_name: z.string().optional().describe("First name from search."),
                last_name: z.string().optional().describe("Last name from search."),
                title: z.string().optional().describe("Job title from search."),
                job_title: z.string().optional().describe("Job title alias."),
                company: z.string().optional().describe("Company from search."),
                headline: z.string().optional().describe("LinkedIn headline from search."),
                email: z.string().optional(),
                phone: z.string().optional(),
                public_identifier: z.string().optional(),
              })
              .passthrough(),
          )
          .min(1)
          .describe(
            "Profiles to save. Include first_name, last_name, title, company, headline from the search result when present.",
          ),
      },
      outputSchema: z.object({}).passthrough(),
      annotations: {
        title: "Save Profiles to List",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ list_name, list_id, create_if_missing, profiles }, extra) => {
      const { data, isError } = await callWebsite(extra.authInfo, "save-to-list", {
        list_name,
        list_id,
        create_if_missing,
        profiles,
      });
      return toolResult(data, isError);
    },
  );

// Fix B — Additive Streamable HTTP GET/SSE for ChatGPT (and similar clients).
// Skybridge's built-in /mcp handler returns 405 for non-POST. Register GET
// BEFORE run() so Express matches it first. POST /mcp is unchanged (Claude live path).
server.express.get("/mcp", (req: any, res: any) => {
  const accept = String(req.headers.accept || "");
  if (
    accept &&
    !accept.includes("text/event-stream") &&
    !accept.includes("*/*")
  ) {
    res.status(406).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Not Acceptable: Client must accept text/event-stream",
      },
      id: null,
    });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // Comment frame so clients/proxies see an open stream immediately.
  res.write(": connected\n\n");

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive);
      return;
    }
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  const cleanup = () => clearInterval(keepAlive);
  req.on("close", cleanup);
  res.on("close", cleanup);
});

// Classic MCP SSE transport (some ChatGPT builds still probe /sse).
// Points clients at Streamable HTTP /mcp for JSON-RPC POSTs.
server.express.get("/sse", (req: any, res: any) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const endpoint = `${SERVER_URL}/mcp`;
  res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive);
      return;
    }
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  const cleanup = () => clearInterval(keepAlive);
  req.on("close", cleanup);
  res.on("close", cleanup);
});

function requireLogsSecret(req: any, res: any): boolean {
  if (!String(process.env.MCP_LOGS_SECRET || "").trim()) {
    sendPrettyJson(res, 503, {
      error: "MCP_LOGS_SECRET is not set",
      hint: "Set MCP_LOGS_SECRET on the Mawsool-MCP Coolify app, then call GET /logs with header X-Mawsool-Logs-Secret.",
    });
    return false;
  }
  if (!logsSecretOk(req)) {
    sendPrettyJson(res, 401, { error: "invalid_logs_secret" });
    return false;
  }
  return true;
}

server.express.get("/logs", (req: any, res: any) => {
  if (!requireLogsSecret(req, res)) return;
  const payload = listToolLogs({
    limit: Number(req.query?.limit),
    tool: String(req.query?.tool || ""),
    email: String(req.query?.email || ""),
  });
  sendPrettyJson(res, 200, payload);
});

server.express.delete("/logs", (req: any, res: any) => {
  if (!requireLogsSecret(req, res)) return;
  sendPrettyJson(res, 200, clearToolLogs());
});

export default await server.run();
export type AppType = typeof server;
