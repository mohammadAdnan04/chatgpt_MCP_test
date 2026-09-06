# syntax=docker/dockerfile:1

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# Coolify often injects NODE_ENV=production at build time, which makes
# npm skip vite/tailwind (devDependencies). Force them in for skybridge build.
ENV NODE_ENV=development
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --include=dev; else npm install; fi

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
USER node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "export __PORT=${PORT:-3000}; exec node dist/__entry.js"]
