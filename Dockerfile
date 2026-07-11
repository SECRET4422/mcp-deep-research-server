# MCPize + any cloud MCP host - Node 20 required (cheerio 1.2 needs File global)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Data dir for persistent memory (mounted volume in production)
ENV HOME=/app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/build ./build
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/src ./src
# Copy configs needed at runtime
COPY --from=builder /app/README.md ./README.md

# Create data dir
RUN mkdir -p /app/.mcp-deep-research/cache && chmod -R 777 /app/.mcp-deep-research

# MCP runs on stdio, not HTTP port
# MCPize will wrap stdio with HTTP automatically
CMD ["node", "build/index.js"]

# Labels for MCP registries
LABEL org.opencontainers.image.title="Deep Research MCP Server"
LABEL org.opencontainers.image.description="Non-generic Deep Research MCP - search, scrape, synthesize, fact-check, memory"
LABEL org.opencontainers.image.source="https://github.com/SECRET4422/mcp-deep-research-server"
