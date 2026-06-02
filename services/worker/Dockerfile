FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @logged/worker... && pnpm --filter @logged/worker build || true
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@logged/worker", "dev"]
