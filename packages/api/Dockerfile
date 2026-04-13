FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy only the packages we need (shared + api)
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/api/package.json packages/api/tsconfig.json ./packages/api/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @pulse/api...

# Copy source
COPY packages/shared/src ./packages/shared/src
COPY packages/api/src ./packages/api/src
COPY packages/api/prisma ./packages/api/prisma

# Generate Prisma client
RUN pnpm --filter @pulse/api db:generate

# Build shared first, then API
RUN pnpm --filter @pulse/shared build
RUN pnpm --filter @pulse/api build

# Production stage
FROM node:22-slim AS production
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/api/package.json ./packages/api/
COPY --from=base /app/packages/api/dist ./packages/api/dist
COPY --from=base /app/packages/api/prisma ./packages/api/prisma
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=base /app/packages/api/node_modules ./packages/api/node_modules

ENV NODE_ENV=production
ENV API_PORT=3001
EXPOSE 3001

CMD ["node", "packages/api/dist/index.js"]
