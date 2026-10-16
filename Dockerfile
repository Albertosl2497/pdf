# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci
COPY scripts/build.mjs scripts/build.mjs
COPY --chown=node:node src src
COPY public public
RUN npm run build

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev && npm cache clean --force && mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/dist dist
COPY --chown=node:node src src
COPY --chown=node:node scripts/owner.mjs scripts/backup.mjs scripts/verify-backup.mjs scripts/identity.mjs scripts/
COPY --chown=node:node schema.sql schema.sql
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/node/server.js"]
