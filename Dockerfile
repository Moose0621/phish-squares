FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=packages/shared --workspace=apps/api

# Build shared package
COPY packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./
RUN npm run build --workspace=packages/shared

# Build API
COPY apps/api/ ./apps/api/
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/package.json ./apps/api/
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
COPY --from=base /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
