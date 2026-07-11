# Deep Research MCP Server - Non-Generic

This is **not** a hello-world MCP. It's a production-grade research agent with real tools.

## What Makes This Non-Generic?

Generic MCPs: `echo`, `read_file`, `fetch`. Boring.

This one:
- **Orchestrated research**: `deep_research` does search -> parallel scrape 3-8 sites -> synthesize report with citations -> saves to history
- **Real search engine** without API key: scrapes DuckDuckGo HTML (with caching, anti-bot headers)
- **Smart scraping**: Cheerio + Turndown, main content detection, removes nav/ads, extracts headings/links/metadata, 10min cache
- **Fact-checking with scoring**: searches both supporting and contradicting sources, heuristic stance detection
- **Source comparison**: Finds consensus vs unique insights across 2-5 URLs
- **Persistent memory**: Saves findings to `~/.mcp-deep-research/memory.json` - survives restarts
- **Resources & Prompts**: Exposes `research://memory`, `research://history`, `research://stats` + workflow prompts

## Architecture

```
src/index.ts ~1100 LOC
  ├── Search: DuckDuckGo HTML parser, UDDG decoding, abort controller
  ├── Scrape: fetch + cheerio + turndown, main-content heuristic
  ├── Insights: entity extraction, stats regex, key-point scoring
  ├── Memory: JSON file store with tags, upsert, fuzzy search
  ├── History: last 100 actions
  └── 8 Tools + 3 Resources + 3 Prompts
```

## Tools (8)

1.  **search_web** - `query, count (1-10), timeFilter` - No API key needed
2.  **scrape_page** - `url, format: markdown|text|full, extractMainOnly` - Cached
3.  **extract_insights** - `content, goal?` - Entities, stats, key points, reading time
4.  **deep_research** - `topic, depth: quick|standard|deep, maxSources, saveMemory` - THE POWER TOOL. Orchestrated.
5.  **compare_sources** - `urls: 2-5, focus?` - Consensus vs contradictions
6.  **fact_check_claim** - `claim, searchDepth` - Verdict: SUPPORTED/CONTRADICTED/MIXED/INCONCLUSIVE + confidence
7.  **memory_save** - `key, value, tags[], source?` - Persistent
8.  **memory_search** - `query, tags[], limit` - Fuzzy

## Resources (3)

- `research://memory` - All persistent memories
- `research://history` - Last 100 searches/researches
- `research://stats` - Cache size, uptime, counts

## Prompts (3)

- `deep-dive-research` - Full research workflow instructions
- `fact-check` - Fact-checking squad instructions
- `compare-narratives` - Bias/comparison table instructions

## Install & Build

```bash
cd mcp-deep-research
npm install
npm run build
```

### Test locally with inspector
```bash
npm run inspect
# opens http://localhost:6274
```

## Usage with Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)
`~/.config/Claude/claude_desktop_config.json` (Linux)

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-deep-research/build/index.js"],
      "env": {}
    }
  }
}
```

Then restart Claude Desktop.

For Cursor / Windsurf:

`.cursor/mcp.json` or settings:

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "node",
      "args": ["/home/user/mcp-deep-research/build/index.js"]
    }
  }
}
```

## Example Workflows

**In Claude:**
> "Use deep_research to research 'state of MCP servers in 2026', depth deep"

Claude will:
1. Call search_web
2. Call deep_research which parallel-scrapes 8 sources
3. Returns synthesized report with citations
4. Auto-saves key findings to memory

> "Fact check claim: 'Bun is faster than Node'"

> "Compare these 3 articles about React 19: [url1], [url2], [url3] focusing on server components"

> "Search my research memory for 'pricing'"

## Data Storage

All data in `~/.mcp-deep-research/`:
- `memory.json` - persistent findings
- `history.json` - audit log
- `cache/` - reserved for future disk cache

No external DB, no API keys required.

## Why Cheerio + Turndown?

- Generic MCPs return raw HTML. This extracts **readable markdown**, headings structure, and links.
- Turndown preserves semantics vs naive text extraction.
- Main-content heuristic uses 9 selectors: article, main, [role=main], .post-content etc.

## Performance

- Search: ~2-4s (DDG HTML)
- Scrape: parallel with 3 workers, 15s timeout per page
- Cache: 10min in-memory to avoid re-fetch
- Deep research (5 sources): ~10-20s end-to-end

## Extension Ideas

- Add Tavily/Brave API if `TAVILY_API_KEY` or `BRAVE_API_KEY` env present (currently falls back to DDG)
- Add PDF scraping via `pdf-parse`
- Add YouTube transcript tool
- Add vector search on memory with embeddings
- Add screenshot tool using puppeteer

## License

MIT
