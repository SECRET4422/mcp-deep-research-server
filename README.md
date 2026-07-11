<p align="center">
  <img src="assets/logo.png" width="140" alt="Deep Research MCP Logo" />
</p>

<h1 align="center">Deep Research MCP Server</h1>
<p align="center"><b>Non-generic MCP for real research. Search → Scrape → Synthesize → Fact-check → Remember.</b></p>

<p align="center">
  [![MCPize](https://mcpize.com/badge/@SECRET4422/deep-research-32)](https://mcpize.com/mcp/deep-research-32)
  <a href="https://github.com/SECRET4422/mcp-deep-research-server/actions"><img src="https://img.shields.io/github/actions/workflow/status/SECRET4422/mcp-deep-research-server/ci.yml?branch=main&label=CI&logo=github" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/SECRET4422/mcp-deep-research-server" alt="MIT" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript" alt="TS" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Compatible-black?logo=anthropic" alt="MCP" /></a>
  <a href="https://www.npmjs.com/package/mcp-deep-research-server"><img src="https://img.shields.io/badge/npm-1.1.0-red?logo=npm" alt="npm" /></a>
  <img src="https://img.shields.io/badge/No%20API%20Key%20Needed-green" alt="No API Key" />
</p>

---

### Why not generic?

| Generic MCP (boring) | This MCP (pro) |
|---|---|
| `echo`, `fetch` | **Orchestrated deep research** |
| Returns raw HTML | **Cheerio + Turndown → clean markdown** + headings, links, meta |
| No memory | **Persistent memory** in `~/.mcp-deep-research/` |
| One page at a time | **Parallel 3-worker scraper**, 10min cache |
| No reasoning | **Fact-check with stance scoring**, contradiction detection |

### Architecture

```mermaid
graph LR
    A[User: deep_research topic] --> B[search_web DDG HTML]
    B --> C[Parallel Scrape x3-8]
    C --> D[cheerio clean + turndown md]
    D --> E[extract_insights heuristic]
    E --> F[Synthesize Report + Citations]
    F --> G[memory_save + history]
    F --> H[Return to Claude]
    
    I[compare_sources] --> C
    J[fact_check_claim] --> B
    K[memory_search] --> G
```

### Tools (8)

| Tool | What it does | Params |
|------|--------------|--------|
| `search_web` | DuckDuckGo HTML search, no API key, UDDG decode | `query, count 1-10, timeFilter` |
| `scrape_page` | Fetch + main-content heuristic + markdown | `url, format=markdown|text|full, extractMainOnly` |
| `extract_insights` | Entities, stats regex, key-point scoring, reading time | `content, goal?` |
| `deep_research` | **Power tool** — search → parallel scrape → synthesize report | `topic, depth=quick|standard|deep, maxSources, saveMemory` |
| `compare_sources` | 2-5 URLs → consensus vs unique vs contradictions | `urls[], focus?` |
| `fact_check_claim` | Searches support + `debunked OR false`, heuristic verdict | `claim, searchDepth` |
| `memory_save` | Save finding to JSON, survives restarts | `key, value, tags[], source?` |
| `memory_search` | Fuzzy search in persistent memory | `query, tags[], limit` |

**Resources:**
- `research://memory` — all saved findings
- `research://history` — last 100 actions
- `research://stats` — cache size, uptime

**Prompts:**
- `deep-dive-research` — full research workflow
- `fact-check` — fact-checker squad
- `compare-narratives` — bias & comparison table

### Install

```bash
git clone https://github.com/SECRET4422/mcp-deep-research-server.git
cd mcp-deep-research-server
npm install
npm run build
```

### Connect via MCPize

Use this MCP server instantly with no local installation:

```bash
npx -y mcpize connect @SECRET4422/deep-research-32 --client claude
```

Or connect at: **https://mcpize.com/mcp/deep-research-32**

### Test (smoke)

```bash
npm run test:mcp
# or
npm run inspect # opens http://localhost:6274
```

Manually tested:
```
[search] Dehradun → 3 results ✓
[deep_research] What is MCP → 3 sources in 2.1s ✓
tools/list → 8 tools ✓
```

### Add to Claude Desktop

Edit config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-deep-research-server/build/index.js"]
    }
  }
}
```

Restart Claude Desktop.

### Add to Cursor / Windsurf / VS Code

`.cursor/mcp.json` or `mcp.json`:

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "node",
      "args": ["./build/index.js"],
      "cwd": "/path/to/mcp-deep-research-server"
    }
  }
}
```

### Example Prompts

**Deep Research:**
> Use deep_research to research "Best LLM fine-tuning in 2026, depth deep" then compare LoRA vs QLoRA

**Fact Check:**
> Fact check claim: "Bun is faster than Node" using fact_check_claim

**Compare:**
> Compare these 3 URLs about MCP architecture focusing on security:
> https://modelcontextprotocol.io/docs/getting-started/intro
> https://www.anthropic.com/news/model-context-protocol
> https://en.wikipedia.org/wiki/Model_Context_Protocol

See `examples/claude-example.md` for more.

### Data Storage

All in `~/.mcp-deep-research/`:
- `memory.json` — persistent findings
- `history.json` — audit log (100 max)
- `cache/` — reserved

No DB, no external calls except search/scrape.

### Pro Features in v1.1.0

- ✅ Logo + pro README + badges
- ✅ GitHub Actions CI (Node 18/20/22) + Release workflow
- ✅ Issue templates, PR template, CONTRIBUTING, SECURITY
- ✅ `.editorconfig`, smoke test script
- ✅ Optimized `package.json` for npm publishing
- ✅ CHANGELOG tracked

### Roadmap

- [ ] Tavily / Brave API fallback if keys present
- [ ] PDF parsing via `pdf-parse`
- [ ] YouTube transcript tool
- [ ] Vector search on memory (embeddings)
- [ ] Blocklist for SSRF (169.254.169.254 etc)
- [ ] Smithery registry

### Dev

```bash
npm run dev     # tsx watch
npm run build
npm run lint
```

Guidelines in `CONTRIBUTING.md`.

### License

MIT © SECRET4422 — See LICENSE

> Built with 🧠 for Dehradun → World. Not a generic MCP.