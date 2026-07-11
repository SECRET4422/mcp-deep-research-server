#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, ensureDataDir } from "./create-server.js";

async function main() {
  await ensureDataDir();
  console.error(`[deep-research-mcp] Starting stdio... Data dir from env HOME`);
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[deep-research-mcp] Running on stdio. Ready!`);
}

main().catch((e) => { console.error("[deep-research-mcp] Fatal:", e); process.exit(1); });
