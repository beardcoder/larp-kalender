# Build: frontend bundle + server compiled into a single self-contained executable.
FROM oven/bun:1.4-debian AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY scripts ./scripts
COPY public ./public
COPY client ./client
COPY src ./src
RUN bun run build

# Runtime: only the binary and the static frontend (curl is used by the Coolify healthcheck).
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /data app \
    && mkdir -p /data && chown app /data
COPY --from=build /app/dist/larp-kalender /usr/local/bin/larp-kalender
COPY --from=build /app/dist/public /app/public

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public \
    PORT=3000
USER app
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["larp-kalender", "health"]

CMD ["larp-kalender", "serve"]
