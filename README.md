# Mawsool local test stack (website + ChatGPT MCP + Claude MCP)

Do not commit `.env` files. This folder is a sandbox against a dedicated Mongo cluster.

## Ports

| App | Folder | URL |
|---|---|---|
| Website API | `back_end` | http://localhost:5000 |
| Search middleware | `middleware_service` | http://localhost:3001 |
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

Search and MCP search need middleware. In `back_end/.env` also set:

```
MAWSOOL_SEARCH_API=http://localhost:3001
MIDDLEWARE_URL=http://localhost:3001
MAWSOOL_MIDDLEWARE_KEY=<same key as middleware>
INTERNAL_SECRET=<same as middleware>
```

## 1b. Middleware (search)

```powershell
cd C:\chatgpt-MCP\mawsool-full-local\middleware_service
copy .env.example .env
npm install
npm start
```

Without this, `/api/proxy/search` and MCP `search` have nothing to call.

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

## Docker / Coolify

Every service has its own `Dockerfile`. Coolify: **Application → Dockerfile**, set **Base Directory** to the folder, **Ports Exposes `3000`**.

| App | Base directory | Dockerfile | Port |
|---|---|---|---|
| Website API | `back_end` | `Dockerfile` | 3000 |
| Search middleware | `middleware_service` | `Dockerfile` | 3000 |
| Website UI | `front_end` | `Dockerfile` | 3000 |
| ChatGPT MCP | `chatgpt-mcp` | `Dockerfile` | 3000 |
| Claude MCP | `Mawsool-MCP` | `Dockerfile` | 3000 |

Frontend build argument (set in Coolify **Build Arguments**, then rebuild):

```
NEXT_PUBLIC_API_URL=https://api.example.com
```

Or deploy the whole stack as one Coolify **Docker Compose** resource using `docker-compose.yml`. Set env vars in the Coolify UI, not in the compose file.

Do not set `AUTH_ISSUER` on the Claude MCP app. ChatGPT MCP and the API must share the same `CHATGPT_MCP_INTERNAL_SECRET`.

### Middleware Coolify env

Base directory `middleware_service`. This is the search engine proxy. The website and MCP never call the index directly.

```
NODE_ENV=production
PORT=3000
MONGO_URI=<same atlas or a cache db>
MAWSOOL_MIDDLEWARE_KEY=<long random, same as backend>
MAWSOOL_ENGINE_URL=https://menasearch.mawsool.tech
BACKEND_URL=https://api.example.com
API_URL=https://api.example.com
INTERNAL_SECRET=<long random, same as backend>
```

### Backend extra env (required for search)

```
MAWSOOL_SEARCH_API=https://middleware.example.com
MIDDLEWARE_URL=https://middleware.example.com
MAWSOOL_MIDDLEWARE_KEY=<same as middleware>
INTERNAL_SECRET=<same as middleware>
```
