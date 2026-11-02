# --- build the web app ---
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- runtime ---
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/web/dist DATA_DIR=/data
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY --from=web /app/web/dist /app/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/api/health" || exit 1
VOLUME /data
CMD ["node", "--disable-warning=ExperimentalWarning", "src/start.js"]
