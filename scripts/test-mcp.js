#!/usr/bin/env node
// Quick smoke test for MCP server without inspector
import { spawn } from "child_process";

const server = spawn("node", ["build/index.js"], { stdio: ["pipe", "pipe", "pipe"] });

let output = "";
server.stdout.on("data", (d) => (output += d.toString()));
server.stderr.on("data", (d) => console.error("[server]", d.toString().trim()));

const tests = [
  { method: "initialize", id: 1, params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } },
  { method: "tools/list", id: 2, params: {} },
  { method: "resources/list", id: 3, params: {} },
  { method: "prompts/list", id: 4, params: {} },
];

tests.forEach((t) => {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: t.id, method: t.method, params: t.params }) + "\n");
});

setTimeout(() => {
  server.kill();
  try {
    const lines = output.trim().split("\n").map((l) => JSON.parse(l));
    console.log(`\n✅ Got ${lines.length} responses`);
    const tools = lines.find((r) => r.id === 2)?.result?.tools || [];
    console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);
    if (tools.length >= 8) {
      console.log("✅ TEST PASSED - 8 tools found");
      process.exit(0);
    } else {
      console.log(`❌ Expected 8 tools, got ${tools.length}`);
      process.exit(1);
    }
  } catch (e) {
    console.error("Failed to parse output", e);
    console.log("Raw output:", output.slice(0, 1000));
    process.exit(1);
  }
}, 2000);
