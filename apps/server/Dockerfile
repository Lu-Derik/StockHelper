# StockHelper backend — runs the Koa server directly from TS via tsx.
# Built from the monorepo root (build context = repo root) so the
# @stockhelper/shared workspace and the lockfile are available.
FROM node:22-slim

WORKDIR /app

# Install workspace deps. Copy only manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

# Source (shared is raw TS, consumed directly)
COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production
EXPOSE 3001

# tsx runs the TypeScript entrypoint without a separate build step.
CMD ["npx", "tsx", "apps/server/src/index.ts"]
