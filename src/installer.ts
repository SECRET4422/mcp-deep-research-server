import fs from "fs/promises";
import path from "path";
import os from "os";

export function getClaudeDesktopConfigPath(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  } else if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else {
    return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
  }
}

export async function runInstaller(): Promise<void> {
  console.log("\n============================================================");
  console.log("   🔍 Deep Research MCP Server — 1-Click Auto Installer");
  console.log("============================================================\n");

  const configPath = getClaudeDesktopConfigPath();
  const configDir = path.dirname(configPath);

  try {
    // 1. Ensure directory exists
    await fs.mkdir(configDir, { recursive: true });

    // 2. Read existing configuration if it exists
    let config: Record<string, any> = { mcpServers: {} };
    try {
      const existingRaw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(existingRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        config = parsed;
      }
    } catch {
      // File doesn't exist or is invalid JSON; start fresh
      config = { mcpServers: {} };
    }

    if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
      config.mcpServers = {};
    }

    // 3. Add deep-research configuration
    const isWindows = process.platform === "win32";
    
    // Config syntax for npx invocation
    config.mcpServers["deep-research"] = {
      command: isWindows ? "cmd" : "npx",
      args: isWindows 
        ? ["/c", "npx", "-y", "mcp-deep-research-server"]
        : ["-y", "mcp-deep-research-server"]
    };

    // 4. Save updated configuration
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    console.log(`✔ Detected platform: ${process.platform} (${os.release()})`);
    console.log(`✔ Updated config at: ${configPath}`);
    console.log(`✔ Configured 'deep-research' MCP server with 8 research tools\n`);
    console.log("------------------------------------------------------------");
    console.log("🎉 Setup complete!");
    console.log("👉 Restart Claude Desktop to use Deep Research.");
    console.log("------------------------------------------------------------\n");
    console.log("Try asking Claude:");
    console.log('  "Use deep_research to research latest developments in quantum computing"');
    console.log('  "Fact check this claim with fact_check_claim: ..."');
    console.log("\n");
  } catch (err: any) {
    console.error(`✖ Installation failed: ${err.message}`);
    console.log("\nYou can manually add this to your claude_desktop_config.json:");
    console.log(JSON.stringify({
      mcpServers: {
        "deep-research": {
          command: process.platform === "win32" ? "cmd" : "npx",
          args: process.platform === "win32"
            ? ["/c", "npx", "-y", "mcp-deep-research-server"]
            : ["-y", "mcp-deep-research-server"]
        }
      }
    }, null, 2));
    process.exit(1);
  }
}
