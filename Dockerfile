FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ sqlite3 curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY scripts ./scripts
ENV DATA_DIR=/data PORT=8080
# Inside the container the process must accept the published port. Compose publishes that port on host loopback only.
ENV BIND_HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 CMD curl -fsS http://localhost:8080/health || exit 1
CMD ["node", "--max-old-space-size=768", "src/index.js"]
