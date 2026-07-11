#!/usr/bin/env node
import express, { Request, Response } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer, ensureDataDir } from "./create-server.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.json({ name: "deep-research-mcp", version: "1.3.0", status: "ok", transport: "streamable-http + sse", tools: 8, author: "SECRET4422", repository: "https://github.com/SECRET4422/mcp-deep-research-server", endpoints: { health: "/health", mcp: "/mcp (POST)", sse: "/sse (GET)" } });
});
app.get("/health", (req: Request, res: Response) => res.json({ status: "ok" }));

const sseTransports: Record<string, SSEServerTransport> = {};

app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e: any) {
    console.error("[http] /mcp error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  res.status(405).json({ error: "Use POST for Streamable HTTP, or /sse for SSE" });
});

app.get("/sse", async (req: Request, res: Response) => {
  const server = createMcpServer();
  const transport = new SSEServerTransport("/messages", res);
  sseTransports[transport.sessionId] = transport;
  res.on("close", () => { delete sseTransports[transport.sessionId]; });
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports[sessionId];
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handlePostMessage(req, res, req.body);
});

async function main() {
  await ensureDataDir();
  const PORT = parseInt(process.env.PORT || "8080", 10);
  app.listen(PORT, "0.0.0.0", () => {
    console.error(`[http] HTTP server on 0.0.0.0:${PORT} endpoints / /health /mcp /sse`);
  });
}
main().catch((e) => { console.error("[http] Fatal:", e); process.exit(1); });
