# Claude Directory readiness — Mawsool MCP

Technical auth/discovery work for Directory is in this repo. **Listing still requires Anthropic review** via the Claude.ai submission portal.

## Connector URL

```
https://mcp.mawsool.tech/mcp
```

## Auth / discovery (implemented)

| Item | Status |
|------|--------|
| OAuth 2.0 + PKCE S256 | Yes |
| DCR `/oauth/register` | Yes (+ `application_type`) |
| **CIMD** (`client_id_metadata_document_supported: true`) | Yes (+ HTTPS `client_id` fetch) |
| AS metadata | `/.well-known/oauth-authorization-server` |
| PR metadata (AS) | `/.well-known/oauth-protected-resource` |
| PR metadata (MCP root + `/mcp`) | Yes |
| `iss` on authorize redirect | Yes |
| Refresh token rotation + reuse detection | Yes |
| `/oauth/revoke` (RFC 7009) | Yes |
| Tool `title` + `readOnlyHint` / `destructiveHint` | Yes |
| User consent screen | Yes (`app-test` `/oauth/authorize`) |
| `MCP_AUTH_REQUIRED=true` | Required in Coolify for Directory |

## Coolify MCP env (production)

```
SERVER_URL=https://mcp.mawsool.tech
MCP_RESOURCE_URL=https://mcp.mawsool.tech/mcp
OAUTH_ISSUER=https://api-test.mawsool.tech
MCP_AUTH_REQUIRED=true
```

(Use production API issuer when you promote off `api-test`.)

## Coolify Backend env (must match)

```
OAUTH_ISSUER=https://api-test.mawsool.tech
FRONTEND_URL=https://app-test.mawsool.tech
CLIENT_URL=https://app-test.mawsool.tech
MCP_RESOURCE_URL=https://mcp.mawsool.tech/mcp
```

Allow Anthropic egress if you firewall: `160.79.104.0/21`.

## Before submit (you must do)

1. Redeploy **Backend + MCP** with the env above  
2. Smoke-test as **custom connector** in Claude (connect → consent → tools)  
3. Exercise every tool (MCP Inspector + Claude)  
4. Prepare: privacy policy URL, public docs/setup blurb, **test credentials** for reviewers  
5. Team/Enterprise Claude.org with directory management access  
6. Submit: https://claude.ai/admin-settings/directory/submissions/new  
7. Auth type: **OAuth** (CIMD and/or DCR — both supported)

## Not guaranteed by code alone

Anthropic security review, content policy, and product quality checks can still reject a listing. This repo makes the **technical OAuth/Directory auth shape** ready.
