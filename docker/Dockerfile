# Multi-stage Dockerfile for StarrBot v2
FROM node:20-alpine AS builder

WORKDIR /app

# No native toolchain needed: nothing in the root or dashboard dependency tree
# uses node-gyp, so `npm ci` never compiles. (Verified by running both installs
# with cc/gcc/g++/make/python3 stubbed out.)

ARG GIT_HASH=unknown
ENV GIT_HASH=${GIT_HASH}

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build dashboard
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ .
RUN npx vite build
WORKDIR /app

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# openssl is used by entrypoint.sh to generate secrets when none are supplied
RUN apk add --no-cache openssl

ARG GIT_HASH=unknown
ENV GIT_HASH=${GIT_HASH}

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built files, node_modules, and dashboard
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Copy entrypoint script
COPY --chown=nodejs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Install su-exec for privilege dropping
RUN apk add --no-cache su-exec

# Create data directory
RUN mkdir -p /app/data

EXPOSE 2013

ENV NODE_ENV=production

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]