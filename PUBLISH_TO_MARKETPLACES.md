# 🚀 Publish to Marketplaces - Option 1 (Earn 80%)

Your repo now has everything needed: `smithery.yaml`, `mcp.json`, `assets/logo.png`, billing middleware.

## 1. Smithery.ai (0% fee, easiest discoverability)

**Link:** https://smithery.ai

**Steps:**
1. Login with GitHub as SECRET4422
2. Click "Publish Server" or go to https://smithery.ai/new
3. Select repo: `SECRET4422/mcp-deep-research-server`
4. It will auto-read `smithery.yaml` - verify:
   - Runtime: typescript
   - Start: node build/index.js
   - Description: Deep Research MCP...
5. Add example questions (already in yaml)
6. Publish
7. Users can now install:
```bash
npx @smithery/cli install mcp-deep-research-server --client claude
```

**Result:** Listed at `https://smithery.ai/server/mcp-deep-research-server` - free traffic, you keep 100% if you add Stripe manually.

## 2. MCPize.com (15% fee, they handle Stripe - BEST FOR MONEY)

**Link:** https://mcpize.com

**Steps:**
1. Sign in with GitHub
2. Dashboard -> New Server -> Import from GitHub
3. URL: `https://github.com/SECRET4422/mcp-deep-research-server`
4. Fill (copy-paste from docs/monetization/README.md):
   - Icon: Upload `assets/logo.png`
   - Short desc: "Deep Research: search, scrape, synthesize, fact-check"
   - Category: Research, Productivity
5. **Enable Monetization:**
   - search_web: $0.01
   - scrape_page: $0.01
   - deep_research quick: $0.03
   - deep_research standard: $0.05
   - deep_research deep: $0.10
   - compare_sources: $0.04
   - fact_check: $0.03
6. Check "Founding Member 15% fee" if before June 10, 2026
7. Publish
8. You get share URL: `https://mcpize.com/mcp/mcp-deep-research-server`
9. Payout monthly to PayPal/Stripe - you keep 80-85%

## 3. AgenticMarket.dev (10-20% fee, you set price)

**Link:** https://agenticmarket.dev

1. List Server -> GitHub URL
2. Set price: e.g. $0.05 per call flat
3. Get secret: `ag_sec_xxxx`
4. Add to your local env when self-hosting, or add to smithery.yaml config (already prepared)
5. Middleware in `src/middleware/billing.ts` will verify `x-agenticmarket-secret` header
6. They handle metering + billing

## 4. Glama.ai & mcp.so (Free traffic boosters)

- https://glama.ai/mcp -> Add Server -> GitHub URL
- https://mcp.so -> Submit

No money directly but brings users to your paid listings.

## After Listing - Update README badges

Add to README.md after publish:
```markdown
[![MCPize](https://img.shields.io/badge/MCPize-Paid%20%2480%25%20you-blue)](https://mcpize.com/mcp/mcp-deep-research-server)
[![Smithery](https://smithery.ai/badge/mcp-deep-research-server)](https://smithery.ai/server/mcp-deep-research-server)
```

## Promo Checklist

- [ ] List on Smithery
- [ ] List on MCPize with pricing
- [ ] List on AgenticMarket
- [ ] List on Glama + mcp.so
- [ ] Tweet: "I built non-generic Deep Research MCP - 8 tools, no API key, earns 80% on MCPize - github.com/SECRET4422/mcp-deep-research-server"
- [ ] Reddit r/mcp, r/ClaudeAI, r/LocalLLaMA
- [ ] dev.to article: "How I made my MCP earn"
