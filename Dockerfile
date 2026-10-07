# Dockerfile — Jobryt AI Agent Web Application & Engine
FROM node:22-alpine

WORKDIR /app

# Install native dependencies needed for canvas/pdf parsing if any
RUN apk add --no-cache wget python3 make g++

# Copy package descriptors first for Docker layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY server.js ./
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY prompts/ ./prompts/
COPY workflows/ ./workflows/

# Ensure data directory exists
RUN mkdir -p /app/data /app/data/profiles /app/data/tracking /app/data/config

# Set default environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV SCRIPTS_DIR=/app/scripts
ENV PROMPTS_DIR=/app/prompts
ENV PORT=3000

# Expose web application port
EXPOSE 3000

# Docker healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/status || exit 1

# Start server
CMD ["node", "server.js"]
