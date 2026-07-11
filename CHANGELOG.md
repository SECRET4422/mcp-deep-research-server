# Changelog

## 1.1.0 (2026-07-11) - Pro Release

### Added
- Logo `assets/logo.png`
- GitHub Actions CI (Node 18,20,22) + Release workflow
- Issue templates, PR template, Funding, Security policy
- Contributing guide
- `package.json` now has repository, homepage, keywords, engines, files
- `scripts/test-mcp.js` smoke test
- Improved README with badges, mermaid architecture, comparison table
- Smithery / MCP registry ready

### Changed
- Bumped version to 1.1.0
- Improved scraper timeout handling
- Better memory store performance

## 1.0.0 (2026-07-11) - Initial Release

- 8 tools: search_web, scrape_page, extract_insights, deep_research, compare_sources, fact_check_claim, memory_save, memory_search
- 3 resources: memory, history, stats
- 3 prompts: deep-dive-research, fact-check, compare-narratives
- Real DuckDuckGo search without API key
- Smart scraping with cheerio + turndown
- Persistent memory in ~/.mcp-deep-research/
