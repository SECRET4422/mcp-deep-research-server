# Example: Using with Claude Desktop

## Prompt 1: Deep Research

```
Hey Claude, use deep_research to research "Best way to fine-tune LLMs in 2026, depth deep". Save key findings.

After that, search your memory for "fine-tune" and compare sources focusing on LoRA vs QLoRA.
```

Claude will:
1. `search_web` for fine-tune LLMs
2. `deep_research depth=deep` -> 8 sources scraped in parallel
3. `memory_save` key findings
4. `memory_search` + `compare_sources`

## Prompt 2: Fact Check

```
Fact check claim: "Dehradun is the capital of Uttarakhand" using fact_check_claim with searchDepth 5
```

Returns SUPPORTED 80% with citations.

## Prompt 3: Compare

```
Compare these articles about MCP:
https://modelcontextprotocol.io/docs/getting-started/intro
https://www.anthropic.com/news/model-context-protocol
https://en.wikipedia.org/wiki/Model_Context_Protocol
Focus on architecture
```

Uses `compare_sources` -> table + consensus.

## Prompt 4: Custom Workflow

```
Use the deep-dive-research prompt, then research "Agentic AI frameworks 2026" and produce a report with executive summary, key findings, stats, gaps, sources.
```
