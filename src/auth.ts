import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  getAuthAudience,
  getAuthIssuer,
  getJwksUrl,
  getMcpResourceUrl,
} from "./config.js";

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

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const issuer = getAuthIssuer();
  const audience = getAuthAudience();
  const resource = getMcpResourceUrl();

  let payload;
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
  if (!sub) {
    throw new InvalidTokenError("missing sub claim");
  }
  if (!email) {
    throw new InvalidTokenError("missing email claim — enable email on the IdP access token");
  }

  const scope = typeof payload.scope === "string" ? payload.scope : "";

  return {
    token,
    clientId: String(payload.azp || payload.client_id || ""),
    scopes: scope.split(/\s+/).filter(Boolean),
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    extra: {
      sub,
      email,
      aud: payload.aud,
    },
  };
}
