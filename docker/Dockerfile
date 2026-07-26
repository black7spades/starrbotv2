# Multi-stage Dockerfile for StarrBot v2
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Copy migrations to dist
RUN cp -r src/config/migrations dist/config/migrations

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies (SQLite3 needs these)
RUN apk add --no-cache sqlite-libs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built files and node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Create data directory
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

USER nodejs

EXPOSE 2013

ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379

CMD ["node", "dist/index.js"]