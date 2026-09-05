# ChatGPT MCP (Mawsool)

Standalone ChatGPT MCP. **Does not call** `backtest.mawsool.tech` or the website API.

Users paste their Mawsool **X-API-Key** in chat. Tools call Apicool + the search API directly.

Do not deploy this over Claude / `mcp.mawsool.tech`.

## Coolify

- GitHub: this repo, branch `main`
- Build pack: **Dockerfile**
- Base directory: **leave empty**
- Ports Exposes: `3000`

```
NODE_ENV=production
PORT=3000
SERVER_URL=https://test-mcp.mawsool.tech
MCP_RESOURCE_URL=https://test-mcp.mawsool.tech/mcp
MCP_AUTH_REQUIRED=false
APICOOL_URL=https://apicool.mawsool.tech
SEARCH_API_URL=https://middleware-test.mawsool.tech
```

Remove `WEBSITE_URL`, `CHATGPT_MCP_INTERNAL_SECRET`, `AUTH_ISSUER`, `DEV_USER_EMAIL`.

Uncheck **Available at Buildtime** for `NODE_ENV`.

ChatGPT connector: `https://test-mcp.mawsool.tech/mcp` — no authentication.

## Local

```bash
cp .env.example .env
npm install
npm run dev
```

- DevTools: http://localhost:3000
- MCP: http://localhost:3000/mcp
