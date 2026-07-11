# How to Monetize This MCP Server - Option 1 (Marketplaces)

You own a non-generic MCP with high-value tools (research saves hours). 95% of 20k MCPs earn $0 because they don't list on paid marketplaces. This guide gets you earning.

## Quick Stats (from your own MCP search)

- Glama: 20,000+ MCP servers
- mcp.so: 19,000+
- Smithery: 6,000+
- Less than 5% make money (per dev.to article)

## Marketplace Comparison

| Marketplace | Fee | How It Works | Revenue Share |
|-------------|-----|--------------|---------------|
| **MCPize.com** | 15% founding (until June 10), 20% after | List server, set $ per call, they handle Stripe + auth | You keep 80-85% |
| **AgenticMarket.dev** | 10-20% | Add header check middleware, set price | You keep 80-90% |
| **Smithery.ai** | 0% (registry) + you can add paid | smithery.yaml, paid config | You keep 100% (you handle Stripe) |
| **SettleGrid** | 10% | Wrap MCP with billing in 5 min | You keep 90% |

## Steps for Each

### MCPize (Easiest - 5 minutes)

1. Go to https://mcpize.com
2. Click "List Server" / "Add MCP"
3. Paste GitHub URL: `https://github.com/SECRET4422/mcp-deep-research-server`
4. Pricing suggestion for YOUR server:
   - `search_web`: $0.01 per call
   - `scrape_page`: $0.01
   - `deep_research quick`: $0.03
   - `deep_research standard`: $0.05
   - `deep_research deep`: $0.10
   - `compare_sources`: $0.04
   - `fact_check_claim`: $0.03
5. Set founding member fee (15% forever if before June 10)
6. Publish - they give you MCP URL to share

### AgenticMarket

1. Go to https://agenticmarket.dev
2. "List MCP Server"
3. GitHub URL same
4. They give you secret: `ag_secret_...`
5. Add to your Smithery config or env:
```
AGENTIC_MARKET_SECRET=ag_secret_...
```
6. Add middleware (see src/middleware/billing.ts) - already included but disabled by default. Enable by setting env var.

### Smithery

1. Go to https://smithery.ai
2. Login with GitHub
3. "Publish" -> Connect repo `SECRET4422/mcp-deep-research-server`
4. It auto-detects `smithery.yaml` (already in repo)
5. Users can now install via:
```bash
npx @smithery/cli install mcp-deep-research-server --client claude
```
6. For paid version on Smithery, add Stripe in Smithery dashboard -> set price per month.

### Glama & mcp.so (Free listing - for traffic)

1. Glama: https://glama.ai/mcp -> Add Server -> GitHub URL
2. mcp.so: https://mcp.so -> Submit -> GitHub URL
These don't handle payments but bring traffic to your paid listings.

## Pricing Strategy for Deep Research MCP

Use 10x rule: Price = Value Delivered / 10

- deep_research saves 2-3 hours of manual research. If user values time at $50/hr, value = $100-150. Price = $10-15 would be too high for per-call. Better: $0.05-$0.10 per call feels cheap but scales.

Example earnings math:
- 100 users * 20 deep_research/month * $0.05 = $100/month
- 1000 users * same = $1000/month
- Add compare + fact_check extra.

Your advantage: No API key needed (DDG) = low cost for you.

## What to put in listing description (copy-paste)

```
Title: Deep Research MCP - Non-Generic Research Agent

Non-generic MCP: Not echo/fetch. Real research orchestration.

8 Tools:
- search_web: DuckDuckGo no API key
- scrape_page: Cheerio+Turndown clean markdown + headings + cache
- deep_research: Search → parallel scrape 3-8 → synthesize with citations (THE power tool)
- compare_sources: Consensus vs contradictions across 2-5 URLs
- fact_check_claim: Verdict SUPPORTED/CONTRADICTED with confidence %
- extract_insights: Entities, stats, key points
- memory_save/search: Persistent memory in ~/.mcp-deep-research/

Why pro? 1100 LOC, 3 workers, 10min cache, 100 history, resources + prompts.

Built by SECRET4422. MIT.
```

## Next: Push v1.2.0 and list

Already done: smithery.yaml, mcp.json in repo. Just go list on those 4 sites today.
