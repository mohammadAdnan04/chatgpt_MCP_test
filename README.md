# ChatGPT MCP (Mawsool)

ChatGPT connector with **Auth0 login**. Claude stays on `mcp.mawsool.tech`.

ChatGPT is the OAuth client. Auth0 issues the JWT. This MCP verifies it, then calls the Mawsool website as that user:

```
X-Mawsool-Internal-Secret
X-Mawsool-User-Email: <email from Auth0>
```

→ `GET/POST {WEBSITE_URL}/api/internal/mcp/*`

Do **not** paste an X-API-Key in chat. Do **not** send ChatGPT to backbeta `/oauth/token`.

The website must be [mena-site september](https://github.com/mawsool/mena-site-/tree/september) (or equivalent) with `/api/internal/mcp` and the same `CHATGPT_MCP_INTERNAL_SECRET`.

## Coolify

- GitHub: this repo, branch `main`
- Build pack: **Dockerfile**
- Base directory: **leave empty**
- Ports Exposes: `3000`

```
NODE_ENV=production
PORT=3000
MCP_AUTH_REQUIRED=true
SERVER_URL=https://test-mcp.mawsool.tech
MCP_RESOURCE_URL=https://test-mcp.mawsool.tech/mcp
AUTH_ISSUER=https://YOUR_TENANT.auth0.com/
AUTH_AUDIENCE=https://test-mcp.mawsool.tech/mcp
WEBSITE_URL=https://backbeta.mawsool.tech
CHATGPT_MCP_INTERNAL_SECRET=<same hex as website back_end>
```

Uncheck **Available at Buildtime** for `NODE_ENV`.

`AUTH_ISSUER` must equal Auth0 `issuer` exactly (usually a trailing `/`). Auth0 API identifier must be `https://test-mcp.mawsool.tech/mcp`. Full tenant checklist: [AUTH0.md](AUTH0.md).

ChatGPT connector: `https://test-mcp.mawsool.tech/mcp`

Do not click Connect until:

```bash
node scripts/check-discovery.mjs https://test-mcp.mawsool.tech
```

prints **GO**. If `token_endpoint` contains `backbeta`, stop.

Then Auth0 → Import from URL: `https://chatgpt.com/oauth/{callback_id}/client.json`.

## Local

```bash
cp .env.example .env
# set DEV_USER_EMAIL to a real Mawsool User.email
# website API on :5000 with the same CHATGPT_MCP_INTERNAL_SECRET
npm install
npm run dev
```

- DevTools: http://localhost:3000
- MCP: http://localhost:3000/mcp
- Health: http://localhost:3000/health
