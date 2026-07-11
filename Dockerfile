# Supports both STDIO and HTTP
# For MCPize (stdio bridge) -> CMD stdio
# For Smithery HTTP -> use build/http.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/app
ENV PORT=8080

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/build ./build
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/src ./src
COPY --from=builder /app/README.md ./README.md

RUN mkdir -p /app/.mcp-deep-research/cache && chmod -R 777 /app/.mcp-deep-research

EXPOSE 8080

# Default to HTTP server for Smithery/MCPize cloud hosting
# Smithery wants a running HTTP URL, not stdio
# For local stdio use: docker run -i --rm image node build/index.js
CMD ["node", "build/http.js"]
