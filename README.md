# ChatGPT MCP (Mawsool)

ChatGPT-only MCP. Do not deploy this over Claude / `mcp.mawsool.tech`.

Pair with the website API that has `/api/internal/mcp` and the same `CHATGPT_MCP_INTERNAL_SECRET`.

## Coolify

- GitHub: this repo, branch `main`
- Build pack: **Dockerfile**
- Base directory: **leave empty**
- Dockerfile: `Dockerfile`
- Ports Exposes: `3000`

```
NODE_ENV=production
PORT=3000
SERVER_URL=https://test-mcp.mawsool.tech
MCP_RESOURCE_URL=https://test-mcp.mawsool.tech/mcp
MCP_AUTH_REQUIRED=false
WEBSITE_URL=https://backtest.mawsool.tech
CHATGPT_MCP_INTERNAL_SECRET=<same as website back_end>
```

Do **not** set `AUTH_ISSUER` / `AUTH_AUDIENCE` / `DEV_USER_EMAIL` for this mode. ChatGPT Connect with **no auth**. Each user pastes their Mawsool website login email as `api_key` in the chat.

Uncheck **Available at Buildtime** for `NODE_ENV`.

To turn Auth0 back on later, see [AUTH0.md](AUTH0.md).

## Local

```bash
cp .env.example .env
npm install
# MCP_AUTH_REQUIRED=false — paste api_key (website email) in ChatGPT
npm run dev
```

- DevTools: http://localhost:3000
- MCP: http://localhost:3000/mcp
