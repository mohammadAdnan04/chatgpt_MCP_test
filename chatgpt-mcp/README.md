## Local (Skybridge UI)

From this folder:

```bash
npm install
# edit .env: set DEV_USER_EMAIL to a real Mawsool website account
npm run dev
```

- DevTools UI: http://localhost:3000
- MCP: http://localhost:3000/mcp
- Website backend must be on http://localhost:5000 with the same `CHATGPT_MCP_INTERNAL_SECRET` (see `back_end/.env.chatgpt.example`).

`MCP_AUTH_REQUIRED=false` skips Auth0 so DevTools can render views. Tools still identify the user via `DEV_USER_EMAIL`.

Views: `search`, `credits`, `contact`, `profile`, `saved`.

For real ChatGPT Connect, set `MCP_AUTH_REQUIRED=true`, fill `AUTH_ISSUER`, and follow [AUTH0.md](AUTH0.md).

## Production

ChatGPT-only Mawsool MCP. **Do not deploy this over Claude / mcp.mawsool.tech.**

```bash
cp .env.example .env
npm install
npm run check
npm run dev
```

## Proof (after Coolify DNS)

Do not click Connect in ChatGPT until this prints `GO`. Full Auth0 order is in [AUTH0.md](AUTH0.md).

```bash
node scripts/check-discovery.mjs https://chatgpt-mcp.mawsool.tech
```

Claude proof (must still work):

```bash
curl -sS https://mcp.mawsool.tech/.well-known/oauth-protected-resource
curl -sS https://backbeta.mawsool.tech/.well-known/oauth-authorization-server
```
