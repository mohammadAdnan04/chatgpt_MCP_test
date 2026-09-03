# ChatGPT MCP — go / no-go (Auth0)

Claude stays on `https://mcp.mawsool.tech` and `https://backbeta.mawsool.tech/oauth/*`.
ChatGPT uses **only** `https://chatgpt-mcp.mawsool.tech/mcp`.
ChatGPT’s token POST goes to **Auth0**, never to backbeta.

Do **not** click Connect in ChatGPT until the proof command prints `GO`.

This is OpenAI’s published ChatGPT OAuth contract plus Auth0’s published MCP tenant settings. Those two documents are the insurance. A custom `/oauth/token` on backbeta is not.

## Order (do not skip or rearrange)

1. Finish Auth0 (section A) until every box is done.
2. Deploy `chatgpt-mcp` + backend secret (section B).
3. Run `node scripts/check-discovery.mjs https://chatgpt-mcp.mawsool.tech` until it prints **GO**.
4. In ChatGPT, create the connector so the page shows the callback id — **do not Connect yet**.
5. Auth0 → Applications → Create → **Import from URL**:
   `https://chatgpt.com/oauth/{callback_id}/client.json`
   Preview must succeed. Grant that app user-delegated access to the MCP API.
6. Run the proof command again. It must still print **GO**.
7. Then click Connect. Login with the **same email** as the Mawsool website account.

## A. Auth0 tenant (required, all of it)

OpenAI names Auth0 as the identity provider for this flow. Auth0’s MCP docs require the items below. Missing any one of them is a **NO-GO**.

### Tenant → Settings → Advanced

Enable all three:

- **Resource Parameter Compatibility Profile**  
  ChatGPT sends `resource=` (RFC 8707), not Auth0’s old `audience=`. Without this toggle Auth0 mints the wrong token (userinfo audience). That is a known Auth0 MCP failure.
- **Include Issuer Identifier in Authorization Response**
- **Client ID Metadata Document Registration**  
  Auth0 then advertises `client_id_metadata_document_supported: true`, which ChatGPT requires for CIMD.

### API

- Identifier (audience): `https://chatgpt-mcp.mawsool.tech/mcp`  
  Must be this exact URL. ChatGPT sends it as `resource`; Auth0 puts it in `aud`.
- Signing: **RS256**
- Application Access Policy: allow **user-delegated** access for third-party / CIMD apps  
  (API → Settings → Default Permissions for Third-Party Applications → User-Delegated Access = Authorized or All, **or** after CIMD import grant that app on the API’s Application Access tab)

### Login connections

ChatGPT’s CIMD app is third-party. It can only use **domain-level** connections.

- Authentication → Database (and Google if you use it)
- Settings → **Promote Connection to Domain Level** → on

### Email on the access token

Auth0 access tokens do not include `email` unless you add it. The MCP maps Mawsool users by email.

Actions → Login / Post Login:

Auth0 drops non-namespaced custom claims. Use this Action (Login / Post Login):

```javascript
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.email) {
    api.accessToken.setCustomClaim("https://mawsool.tech/email", event.user.email);
  }
};
```

Users sign in with the **same email** as `leads.mawsool.tech`.

### Issuer string

Open `https://YOUR_TENANT.auth0.com/.well-known/openid-configuration`.

Copy `issuer` **character-for-character** (Auth0 usually includes a trailing `/`) into Coolify `AUTH_ISSUER`.

### CIMD vs Auth0 plan

ChatGPT’s `client.json` advertises `none` and `private_key_jwt`. Import-from-URL is the Auth0-supported way to accept that client.

- If **Preview / Create succeeds**, Auth0 has accepted ChatGPT as a client. That is the Auth0-side GO for client identity.
- Auth0 **Private Key JWT for CIMD** is an Enterprise feature. If Import fails on `private_key_jwt`, do not guess. On that tenant: enable **Dynamic Client Registration**, leave CIMD off so ChatGPT uses DCR + PKCE `none`, then re-run the proof script. Pick **one** of CIMD or DCR — the proof script checks that Auth0 is actually advertising it.

## B. Coolify

### New app (not Mawsool-MCP / Claude)

- Base directory: **empty** (this repo is the MCP at the root)
- Dockerfile: `Dockerfile`
- Port: `3000`
- Domain: `chatgpt-mcp.mawsool.tech`

Generate the shared secret once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```
SERVER_URL=https://chatgpt-mcp.mawsool.tech
MCP_RESOURCE_URL=https://chatgpt-mcp.mawsool.tech/mcp
MCP_AUTH_REQUIRED=true
AUTH_ISSUER=https://YOUR_TENANT.auth0.com/
AUTH_AUDIENCE=https://chatgpt-mcp.mawsool.tech/mcp
WEBSITE_URL=https://backbeta.mawsool.tech
CHATGPT_MCP_INTERNAL_SECRET=<long random string>
```

`AUTH_ISSUER` must equal the OIDC `issuer` string exactly.

### Existing website backend (additive)

```
CHATGPT_MCP_INTERNAL_SECRET=<same string>
```

Deploy backend only when it already includes `/api/internal/mcp`. Do not change `oauthController.js` or Claude MCP env.

## C. Proof command (hard gate)

```bash
node chatgpt-mcp/scripts/check-discovery.mjs https://chatgpt-mcp.mawsool.tech
```

**GO** means all of these are true at once:

- PRM `resource` is `https://chatgpt-mcp.mawsool.tech/mcp`
- PRM `authorization_servers[0]` equals Auth0 `issuer` exactly
- Auth0 `token_endpoint` is Auth0, not backbeta
- Auth0 advertises PKCE `S256`
- Auth0 advertises CIMD (`client_id_metadata_document_supported: true`) **or** DCR (`registration_endpoint`)
- Auth0 advertises token auth `none` and/or `private_key_jwt` (what ChatGPT uses)

Anything else is **NO-GO**. Do not open ChatGPT Connect on NO-GO.

Also confirm Claude is untouched:

```bash
curl -sS https://mcp.mawsool.tech/.well-known/oauth-protected-resource
curl -sS https://backbeta.mawsool.tech/.well-known/oauth-authorization-server
```

## D. ChatGPT (only after GO)

1. Developer Mode on
2. Custom connector URL: `https://chatgpt-mcp.mawsool.tech/mcp`
3. Copy callback id → finish Auth0 Import from URL + API grant if not already done
4. Connect and sign in
5. Ask: check my Mawsool credits

Auth0 Monitoring → logs must show a token issued for that login. That is ChatGPT posting to Auth0.
