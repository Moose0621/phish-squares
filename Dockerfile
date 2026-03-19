# ── Stage 1: Build shared + API ──
FROM node:22-alpine AS api-build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspace=packages/shared --workspace=apps/api

COPY packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./
RUN npm run build --workspace=packages/shared

COPY apps/api/ ./apps/api/
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

# ── Stage 2: Build web ──
FROM node:22-alpine AS web-build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --workspace=packages/shared --workspace=apps/web

COPY packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./
COPY apps/web/ ./apps/web/

ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build --workspace=apps/web

# ── Stage 3: API production image ──
FROM node:22-alpine AS api

RUN apk add --no-cache wget

WORKDIR /app

COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/packages/shared/dist ./packages/shared/dist
COPY --from=api-build /app/packages/shared/package.json ./packages/shared/
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/package.json ./apps/api/
COPY --from=api-build /app/apps/api/prisma ./apps/api/prisma
COPY --from=api-build /app/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/api/dist/server.js"]

# ── Stage 4: Web production image (nginx) ──
FROM nginx:alpine AS web

COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
