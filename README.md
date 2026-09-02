# Mawsool local test stack (website + ChatGPT MCP + Claude MCP)

Do not commit `.env` files. This folder is a sandbox against a dedicated Mongo cluster.

## Ports

| App | Folder | URL |
|---|---|---|
| Website API | `back_end` | http://localhost:5000 |
| Website UI | `front_end` | http://localhost:3006 |
| ChatGPT MCP + UI | `chatgpt-mcp` | http://localhost:3000 |
| Claude MCP (Mawsool-MCP) | `Mawsool-MCP` | http://localhost:3002 |

## 1. Backend

```powershell
cd C:\chatgpt-MCP\mawsool-full-local\back_end
npm install
npm run dev
```

Mongo is already set in `back_end/.env` (`MONGO_URI`). You should see `MongoDB connected`.

## 2. Frontend

```powershell
cd C:\chatgpt-MCP\mawsool-full-local\front_end
npm install
npm run dev
```

Sign up / log in at http://localhost:3006. Put that account email in `chatgpt-mcp/.env` as `DEV_USER_EMAIL`.

## 3. ChatGPT MCP (Skybridge UI)

```powershell
cd C:\chatgpt-MCP\mawsool-full-local\chatgpt-mcp
npm install
npm run dev
```

DevTools: http://localhost:3000  
MCP: http://localhost:3000/mcp  

`MCP_AUTH_REQUIRED=false` — uses `DEV_USER_EMAIL` instead of Auth0.

## 4. Claude MCP (optional)

```powershell
cd C:\chatgpt-MCP\mawsool-full-local\Mawsool-MCP
npm install
npm run dev
```

MCP: http://localhost:3002/mcp  
Do not set `AUTH_ISSUER` here.

## ChatGPT Connect (later)

Set `MCP_AUTH_REQUIRED=true` in `chatgpt-mcp/.env`, fill `AUTH_ISSUER` from Auth0, then `npm run dev:tunnel`. See `chatgpt-mcp/AUTH0.md`.
