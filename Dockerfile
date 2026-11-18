# 1) Build du front
FROM node:24-alpine AS web
WORKDIR /app
COPY server/src server/src
COPY web/package*.json web/
RUN cd web && npm ci
COPY web web
RUN cd web && npm run build

# 2) Serveur (Node exécute le TypeScript directement, sans étape de compilation)
FROM node:24-alpine
ENV NODE_ENV=production NODE_NO_WARNINGS=1
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/src server/src
COPY --from=web /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/server
ENV DB_PATH=/data/carnet-afya.db PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/index.ts"]
