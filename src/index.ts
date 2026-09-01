#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, ensureDataDir } from "./create-server.js";
import { runInstaller } from "./installer.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--install") || args.includes("--setup") || args.includes("-i")) {
    await runInstaller();
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Deep Research MCP Server (v1.3.1)
Non-generic, Zero-API-Key Deep Research & Fact-Checking MCP Server.

Usage:
  npx mcp-deep-research-server           Run MCP server in stdio mode (default)
  npx mcp-deep-research-server --install 1-Click auto-setup for Claude Desktop
  npx mcp-deep-research-server --help    Show this help message

Repository: https://github.com/SECRET4422/mcp-deep-research-server
npm:        https://www.npmjs.com/package/mcp-deep-research-server
`);
    return;
  }

  await ensureDataDir();
  console.error(`[deep-research-mcp] Starting stdio... Data dir from env HOME`);
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[deep-research-mcp] Running on stdio. Ready!`);
}

main().catch((e) => {
  console.error("[deep-research-mcp] Fatal:", e);
  process.exit(1);
});

