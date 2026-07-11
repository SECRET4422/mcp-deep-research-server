# Contributing

Thanks for wanting to contribute! This MCP is built to be non-generic and production-ready.

## Dev Setup

```bash
git clone https://github.com/SECRET4422/mcp-deep-research-server.git
cd mcp-deep-research-server
npm install
npm run build
npm run inspect  # opens MCP inspector on localhost:6274
```

## Project Structure

```
src/index.ts          # All tools, resources, prompts, search+scrape engine
build/                # Compiled JS (not committed, built on CI)
.github/workflows/    # CI + Release
assets/               # Logo etc
```

## Adding a New Tool

1. Open `src/index.ts`
2. Add `server.tool("your_tool", "description", { zodSchema }, async (args) => { ... })`
3. Follow existing pattern:
   - Log to `console.error` for debugging (stdout is reserved for MCP)
   - Return `{ content: [{ type: "text", text: "..." }] }`
   - Use `addHistory()` for audit trail
4. Test with inspector, then with Claude Desktop
5. Update README.md table

## Guidelines

- No API keys required for core features. If you add optional APIs (Tavily, Brave), make them fallback gracefully.
- Keep scraping robust: handle non-HTML, timeouts, aborts.
- Memory/store files go to `~/.mcp-deep-research/` not repo.
- No `console.log` — only `console.error`.

## Commit Style

- `feat: add youtube transcript tool`
- `fix: handle DDG redirect parsing for mobile`
- `docs: update Claude config example`
- `chore: bump deps`

## PR Process

1. Fork → feature branch
2. `npm run build` must pass
3. Test with `npm run inspect`
4. Update README if tool added
5. Open PR using template

## Code of Conduct

Be kind, helpful, no spam. Build tools that actually help researchers.
