# Live Metal – Shopify app (Docker)
# Build: docker build -t shopify-live-metal .
# Run: docker run -p 3000:8080 --env-file .env -v live-metal-data:/app/data shopify-live-metal

FROM node:20-alpine AS base

# Install deps
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:./prisma/dev.sqlite"
RUN npx prisma generate
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Deploy convention: backends listen on 8080
ENV PORT=8080
# Persist SQLite DB (override in run with -e DATABASE_URL=file:/app/data/dev.sqlite)
ENV DATABASE_URL="file:/app/data/dev.sqlite"

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN mkdir -p /app/data

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
RUN chown -R nodejs:nodejs /app/data /app/prisma /app/node_modules/.prisma

USER nodejs
EXPOSE 8080

# Run migrations, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node node_modules/@remix-run/serve/dist/cli.js ./build/server/index.js"]
