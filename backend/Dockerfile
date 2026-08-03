FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev \
  --workspace @kshiai/shared \
  --workspace @kshiai/backend

FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY backend backend
COPY packages/shared packages/shared
RUN npm run build --workspace @kshiai/shared \
  && npm run build --workspace @kshiai/backend

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8080 \
  POSTGRES_CA_CERT_PATH=/app/infra/supabase-ca-2021.crt

WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules node_modules
COPY --from=dependencies --chown=node:node /app/backend/package.json backend/package.json
COPY --from=dependencies --chown=node:node /app/packages/shared/package.json packages/shared/package.json
COPY --from=build --chown=node:node /app/backend/dist backend/dist
COPY --chown=node:node backend/migrations backend/migrations
COPY --from=build --chown=node:node /app/packages/shared/dist packages/shared/dist
COPY --chown=node:node infra/supabase-ca-2021.crt infra/supabase-ca-2021.crt

USER node
EXPOSE 8080
CMD ["node", "backend/dist/index.js"]
