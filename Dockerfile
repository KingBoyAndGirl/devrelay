# DevRelay - AI-driven software delivery lifecycle management
# Single-container Docker deployment

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx next build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/devrelay.db
ENV DATA_DIR=/data
ENV NEXTAUTH_URL=http://localhost:3000
ENV PORT=3000

RUN addgroup -g 1001 -S devrelay && adduser -S devrelay -u 1001

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.js ./next.config.js

RUN mkdir -p /data && chown -R devrelay:devrelay /app /data

USER devrelay

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
