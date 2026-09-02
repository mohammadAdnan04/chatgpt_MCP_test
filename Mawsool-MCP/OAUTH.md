# Mawsool MCP — Claude Directory OAuth

This MCP server uses **OAuth 2.1 + PKCE** against the Mawsool backend (Authorization Server).

Directory listing expects **CIMD** (preferred) and/or **DCR**, tool annotations, and a live remote URL. See `DIRECTORY.md`.

## Production connector URL

```
https://mcp.mawsool.tech/mcp
```

## Coolify MCP env

```
SERVER_URL=https://mcp.mawsool.tech
MCP_RESOURCE_URL=https://mcp.mawsool.tech/mcp
OAUTH_ISSUER=https://api-test.mawsool.tech
MCP_AUTH_REQUIRED=true
```

## Coolify Backend env

```
OAUTH_ISSUER=https://api-test.mawsool.tech
FRONTEND_URL=https://app-test.mawsool.tech
CLIENT_URL=https://app-test.mawsool.tech
MCP_RESOURCE_URL=https://mcp.mawsool.tech/mcp
```

## Local test

### 1. Backend (AS) — port 8000
```
OAUTH_ISSUER=http://localhost:8000
MCP_RESOURCE_URL=http://localhost:3000/mcp
MAWSOOL_DEFAULT_API_KEY=<your apicool key>
FRONTEND_URL=http://localhost:3006
```

### 2. Frontend consent — port 3006
Consent UI: `/oauth/authorize`

### 3. MCP — port 3000
```bash
npm install
npm run dev
```

Set `MCP_AUTH_REQUIRED=false` only for local DevTools without OAuth.

### 4. Connect Claude (custom connector)
1. Public MCP URL (tunnel or Coolify)
2. Claude → Connectors → Add custom connector → paste `…/mcp`
3. Auth: OAuth — Claude uses **CIMD** when AS advertises `client_id_metadata_document_supported: true` + `token_endpoint_auth_methods_supported` includes `none`; otherwise **DCR** via `/oauth/register`
4. Approve on Mawsool consent screen

## Endpoints (Authorization Server = Mawsool backend)

| Path | Purpose |
|------|---------|
| `/.well-known/oauth-authorization-server` | AS metadata (CIMD + revoke) |
| `/.well-known/oauth-protected-resource` | Protected resource metadata |
| `/oauth/authorize` | Browser authorize → FE consent |
| `/oauth/token` | Code + refresh |
| `/oauth/register` | Dynamic Client Registration |
| `/oauth/revoke` | RFC 7009 token revocation |
| `/oauth/introspect` | Token validation for MCP |

## MCP discovery

| Path | Purpose |
|------|---------|
| `/.well-known/oauth-protected-resource` | Root PR metadata (Directory) |
| `/.well-known/oauth-protected-resource/mcp` | Path-style PR metadata |
| `/mcp` | Streamable HTTP MCP + Bearer |

## ChatGPT (same Mawsool-MCP code, different Coolify app)

Do **not** set `AUTH_ISSUER` on the Claude MCP Coolify app.

New Coolify app, **base directory `Mawsool-MCP`**, domain `chatgpt-mcp.mawsool.tech`:

```
SERVER_URL=https://chatgpt-mcp.mawsool.tech
MCP_RESOURCE_URL=https://chatgpt-mcp.mawsool.tech/mcp
MCP_AUTH_REQUIRED=true
AUTH_ISSUER=https://YOUR_TENANT.us.auth0.com/
AUTH_AUDIENCE=https://chatgpt-mcp.mawsool.tech/mcp
WEBSITE_URL=https://backbeta.mawsool.tech
CHATGPT_MCP_INTERNAL_SECRET=<same as backend>
PORT=3000
```

Claude connector stays `https://mcp.mawsool.tech/mcp`.
ChatGPT connector is `https://chatgpt-mcp.mawsool.tech/mcp`.

## Redirect URIs

- `https://claude.ai/api/mcp/auth_callback`
- `https://claude.com/api/mcp/auth_callback`
- Claude Code loopback: `http://localhost/callback`, `http://127.0.0.1/callback` (any port)
