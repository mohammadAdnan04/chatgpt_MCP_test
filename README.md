# ChatGPT MCP (Mawsool)

Standalone ChatGPT connector. No website, no OAuth. Users paste a Mawsool **X-API-Key** in chat.

Tools match [docs.mawsool.tech](https://docs.mawsool.tech/): `GET /credits`, `POST /search`, `GET /contact`, `GET /full-info`.

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
```

Remove `WEBSITE_URL`, `APICOOL_URL`, `SEARCH_API_URL`, `CHATGPT_MCP_INTERNAL_SECRET`, `AUTH_ISSUER`.

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
