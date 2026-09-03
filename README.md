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
SERVER_URL=https://chatgpt-mcp.example.com
MCP_RESOURCE_URL=https://chatgpt-mcp.example.com/mcp
MCP_AUTH_REQUIRED=true
AUTH_ISSUER=https://YOUR_TENANT.auth0.com/
AUTH_AUDIENCE=https://chatgpt-mcp.example.com/mcp
WEBSITE_URL=https://api.example.com
CHATGPT_MCP_INTERNAL_SECRET=<same as website back_end>
```

Uncheck **Available at Buildtime** for `NODE_ENV`. Auth0 order: [AUTH0.md](AUTH0.md).

## Local

```bash
cp .env.example .env
npm install
# MCP_AUTH_REQUIRED=false and DEV_USER_EMAIL for DevTools
npm run dev
```

- DevTools: http://localhost:3000
- MCP: http://localhost:3000/mcp
