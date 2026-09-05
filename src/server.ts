import { McpServer } from "skybridge/server";
import { z } from "zod";
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { verifyAccessToken } from "./auth.js";
import {
  fetchAccountCredits,
  searchMawsool,
  contactMawsool,
  fullInfoMawsool,
} from "./mawsool.js";
import {
  assertChatgptMcpConfig,
  authRequired,
  getAuthIssuer,
  getMcpResourceUrl,
  getServerUrl,
  getAuthorizationServerMetadata,
  getProtectedResourceDoc,
} from "./config.js";

await assertChatgptMcpConfig();

function toolResult(data: any, isError: boolean) {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function isDiscoveryGet(req: any, ...paths: string[]) {
  if (req.method !== "GET") return false;
  const p = String(req.path || "");
  const u = String(req.url || "").split("?")[0];
  return paths.some((x) => p === x || u === x);
}

const resourceMetadataUrl = `${getServerUrl()}/.well-known/oauth-protected-resource`;

function placeholderAsMetadata() {
  try {
    const issuer = getAuthIssuer();
    const base = issuer.replace(/\/+$/, "");
    return {
      issuer,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      scopes_supported: ["mcp", "offline_access"],
    };
  } catch {
    return {
      issuer: "https://auth.example.com/",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/oauth/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      scopes_supported: ["mcp", "offline_access"],
    };
  }
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

const toolSecurity = authRequired()
  ? [{ type: "oauth2" as const, scopes: ["mcp"] }]
  : [];

let server = new McpServer(
  {
    name: "MawsoolContactServer",
    version: "1.0.0",
  },
  { capabilities: {} },
);

if (authRequired()) {
  server = server.use((req: any, res: any, next: any) => {
    if (
      isDiscoveryGet(
        req,
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
        "/mcp/.well-known/oauth-protected-resource",
      )
    ) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(getProtectedResourceDoc());
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
      getAuthorizationServerMetadata()
        .then((doc) => {
          res.setHeader("Content-Type", "application/json");
          res.status(200).json(doc);
        })
        .catch((err) => {
          console.error("[chatgpt-mcp] AS metadata fetch failed:", err?.message || err);
          res.status(502).json({ error: "server_error" });
        });
      return;
    }
    next();
  });

  server = server.use(
    mcpAuthMetadataRouter({
      oauthMetadata: placeholderAsMetadata(),
      resourceServerUrl: new URL(getMcpResourceUrl()),
    }),
  );
}

// Copied from Mawsool-MCP: ChatGPT browser CORS + Accept + GET /mcp + /sse.
server = server.use("/mcp", attachMcpCors);
server = server.use("/sse", attachMcpCors);

server = server.use("/mcp", (req: any, _res: any, next: any) => {
  if (req.method === "POST") {
    const accept = String(req.headers.accept || "");
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
      req.headers.accept = "application/json, text/event-stream";
    }
  }
  next();
});

if (authRequired()) {
  const bearer = requireBearerAuth({
    verifier: { verifyAccessToken },
    requiredScopes: [],
    resourceMetadataUrl,
  });
  server = server.use("/mcp", bearer);
  server = server.use("/sse", bearer);
  console.log(
    `[chatgpt-mcp] JWT auth ON. issuer=${getAuthIssuer()} resource=${getMcpResourceUrl()}`,
  );
} else {
  console.log(
    `[chatgpt-mcp] NO AUTH. ChatGPT can connect without OAuth. Paste X-API-Key in chat (https://docs.mawsool.tech/).`,
  );
}

const apiKeyField = z
  .string()
  .min(1)
  .describe(
    "Required. User pastes this in the ChatGPT chat — no login. Mawsool X-API-Key from https://docs.mawsool.tech/. Ask once if missing, then reuse it on every tool call. Never invent or guess it.",
  );

server = server
  .registerTool(
    {
      name: "check-credits",
      description:
        "GET /credits — remaining Mawsool API credits for the pasted X-API-Key. See https://docs.mawsool.tech/",
      inputSchema: {
        api_key: apiKeyField,
      },
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
      securitySchemes: toolSecurity,
      view: { component: "credits" },
    },
    async ({ api_key }) => {
      const result = await fetchAccountCredits(api_key);
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
        "POST /search — people or companies (https://docs.mawsool.tech/). Requires X-API-Key. Max 50 results per page.",
      inputSchema: {
        api_key: apiKeyField,
        filters: z.record(z.string(), z.any()).describe("Search filters."),
        search_type: z.string().default("people").describe("'people' or 'companies'."),
        page: z.number().default(1).describe("1-based page."),
        limit: z
          .number()
          .default(10)
          .describe("Results per page. Default 10, max 50 (Mawsool API)."),
      },
      outputSchema: z.object({}).passthrough(),
      annotations: {
        title: "Search B2B Records",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      securitySchemes: toolSecurity,
      view: { component: "search" },
    },
    async ({ api_key, filters, search_type, page, limit }) => {
      const { data, isError } = await searchMawsool(api_key, {
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
        "GET /contact — enrich a LinkedIn URL (email 5 credits, phone 20). Requires X-API-Key. fields e.g. 'email,phone'.",
      inputSchema: {
        api_key: apiKeyField,
        url: z.string().url().describe("LinkedIn profile URL."),
        fields: z.string().min(1).describe("Comma-separated fields, e.g. 'email,phone'."),
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
      securitySchemes: toolSecurity,
      view: { component: "contact" },
    },
    async ({ api_key, url, fields, country }) => {
      const { data, isError } = await contactMawsool(api_key, {
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
        "GET /full-info — LinkedIn profile details without contact reveal. Requires X-API-Key.",
      inputSchema: {
        api_key: apiKeyField,
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
      securitySchemes: toolSecurity,
      view: { component: "profile" },
    },
    async ({ api_key, url }) => {
      const { data, isError } = await fullInfoMawsool(api_key, url);
      return toolResult(data, isError);
    },
  )
  .registerTool(
    {
      name: "save-to-list",
      description:
        "Not available on this standalone ChatGPT MCP (no website lists). Copy search/contact results instead.",
      inputSchema: {
        api_key: apiKeyField,
        list_name: z.string().optional().describe("Target list name, e.g. 'Outreach Q1'. Created if missing."),
        list_id: z.string().optional().describe("Existing Mawsool list id (if known)."),
        create_if_missing: z.boolean().optional().describe("Create list_name when it does not exist (default true)."),
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
      securitySchemes: toolSecurity,
      view: { component: "saved" },
    },
    async () => {
      return toolResult(
        {
          error:
            "save-to-list is not available on the standalone ChatGPT MCP. It does not use the Mawsool website.",
        },
        true,
      );
      return toolResult(data, isError);
    },
  );

server.express.get("/mcp", (req: any, res: any) => {
  const accept = String(req.headers.accept || "");
  if (accept && !accept.includes("text/event-stream") && !accept.includes("*/*")) {
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

server.express.get("/sse", (req: any, res: any) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const endpoint = `${getServerUrl()}/mcp`;
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

server.express.get("/", (_req: any, res: any) => {
  res.status(200).type("text/plain").send("ok");
});
server.express.get("/health", (_req: any, res: any) => {
  res.status(200).json({ ok: true, auth: authRequired() });
});

export default await server.run();
export type AppType = typeof server;
