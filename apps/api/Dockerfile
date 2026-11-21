FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @kropka/api...
RUN pnpm --filter @kropka/api build # prebuild hook builds @kropka/core first
WORKDIR /app/apps/api
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
