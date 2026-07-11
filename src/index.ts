#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(os.homedir(), ".mcp-deep-research");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const CACHE_DIR = path.join(DATA_DIR, "cache");

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

// Cache in memory
const pageCache = new Map<string, { content: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

type MemoryItem = {
  id: string;
  key: string;
  value: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source?: string;
};

type HistoryItem = {
  id: string;
  type: "search" | "research" | "scrape" | "fact_check" | "compare";
  query: string;
  timestamp: string;
  resultSummary: string;
  sources?: string[];
};

// --- Ensure data dir ---
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(CACHE_DIR, { recursive: true });
    try {
      await fs.access(MEMORY_FILE);
    } catch {
      await fs.writeFile(MEMORY_FILE, JSON.stringify({ memories: [], version: 1 }, null, 2));
    }
    try {
      await fs.access(HISTORY_FILE);
    } catch {
      await fs.writeFile(HISTORY_FILE, JSON.stringify({ history: [], version: 1 }, null, 2));
    }
  } catch (e) {
    console.error("[deep-research] Failed to ensure data dir:", e);
  }
}

// --- Memory Store ---
async function loadMemory(): Promise<{ memories: MemoryItem[] }> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { memories: [] };
  }
}
async function saveMemory(data: { memories: MemoryItem[] }) {
  await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
}
async function loadHistory(): Promise<{ history: HistoryItem[] }> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { history: [] };
  }
}
async function saveHistory(data: { history: HistoryItem[] }) {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2));
}
async function addHistory(item: Omit<HistoryItem, "id" | "timestamp">) {
  const { history } = await loadHistory();
  history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    ...item,
  });
  // Keep last 100
  const trimmed = history.slice(0, 100);
  await saveHistory({ history: trimmed });
}

// --- Search Engine ---
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

async function searchDuckDuckGo(query: string, count: number = 5): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // html.duckduckgo.com gives server-rendered HTML without JS
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.error(`[search] Querying: ${searchUrl}`);
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo returned ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // DDG html structure: .result
    $(".result").each((i, el) => {
      if (results.length >= count) return false;
      const titleEl = $(el).find(".result__a");
      const snippetEl = $(el).find(".result__snippet");
      const urlEl = $(el).find(".result__url");

      let title = titleEl.text().trim();
      let href = titleEl.attr("href") || "";
      let snippet = snippetEl.text().trim();

      // href is often /l/?uddg=encodedUrl
      if (href.startsWith("/l/") || href.includes("uddg=")) {
        try {
          const urlParams = new URL(href, "https://duckduckgo.com").searchParams;
          const uddg = urlParams.get("uddg");
          if (uddg) {
            href = decodeURIComponent(uddg);
          }
        } catch {}
      } else if (href.startsWith("//")) {
        href = "https:" + href;
      } else if (href.startsWith("/")) {
        // for relative, try to get from result__url text
        const textUrl = urlEl.text().trim();
        if (textUrl) {
          href = textUrl.startsWith("http") ? textUrl : "https://" + textUrl;
        }
      }

      if (title && href && href.startsWith("http")) {
        results.push({
          title: title.slice(0, 200),
          url: href,
          snippet: snippet.slice(0, 400),
          source: "duckduckgo",
        });
      }
    });

    // Fallback: if no .result, try .results .result__body etc (old layout)
    if (results.length === 0) {
      $(".result__body").each((i, el) => {
        if (results.length >= count) return false;
        const titleEl = $(el).find(".result__a").first();
        let title = titleEl.text().trim();
        let href = titleEl.attr("href") || "";
        let snippet = $(el).find(".result__snippet").text().trim();
        if (href.includes("uddg=")) {
          try {
            const u = new URL(href, "https://duckduckgo.com").searchParams.get("uddg");
            if (u) href = decodeURIComponent(u);
          } catch {}
        }
        if (title && href && href.startsWith("http")) {
          results.push({ title, url: href, snippet, source: "duckduckgo" });
        }
      });
    }

    console.error(`[search] Found ${results.length} results for "${query}"`);
    return results;
  } catch (e: any) {
    console.error("[search] Failed:", e.message);
    // Return empty but not crash - allow other engines fallback in future
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// --- Scraper ---
interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  text: string;
  markdown: string;
  headings: { level: number; text: string }[];
  links: { text: string; href: string }[];
  wordCount: number;
  scrapedAt: string;
}

async function scrapePage(url: string, extractMainOnly = true): Promise<ScrapedPage> {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.error(`[scrape] cache hit for ${url}`);
    return cached.content;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    console.error(`[scrape] fetching ${url}`);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      // non-html
      const text = await res.text();
      const result: ScrapedPage = {
        url,
        title: url,
        description: `Non-HTML content: ${contentType}`,
        text: text.slice(0, 15000),
        markdown: text.slice(0, 15000),
        headings: [],
        links: [],
        wordCount: text.split(/\s+/).length,
        scrapedAt: new Date().toISOString(),
      };
      pageCache.set(url, { content: result, timestamp: Date.now() });
      return result;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract metadata
    let title = $("title").first().text().trim() || $("h1").first().text().trim() || url;
    let description = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";

    // Remove junk
    $("script, style, noscript, iframe, svg, canvas, form, button").remove();
    if (extractMainOnly) {
      $("nav, header, footer, aside, .nav, .navbar, .sidebar, .comments, .comment, #comments, .advertisement, .ad, .ads").remove();
    }

    // Find main content container
    let contentRoot: cheerio.Cheerio<any> | null = null;
    const candidates = ["article", "main", "[role=main]", ".post-content", ".article-content", ".entry-content", "#main-content", "#content", ".content"];

    for (const sel of candidates) {
      const el = $(sel).first();
      if (el.length > 0 && el.text().trim().length > 200) {
        contentRoot = el;
        break;
      }
    }
    if (!contentRoot) contentRoot = $("body");

    // Extract headings
    const headings: { level: number; text: string }[] = [];
    contentRoot.find("h1, h2, h3").each((_, el) => {
      const tag = (el as any).tagName.toLowerCase();
      const level = parseInt(tag.replace("h", ""), 10);
      const text = $(el).text().trim();
      if (text) headings.push({ level, text: text.slice(0, 200) });
    });

    // Extract links (top 20 meaningful)
    const links: { text: string; href: string }[] = [];
    contentRoot.find("a[href]").each((_, el) => {
      if (links.length >= 30) return false;
      const text = $(el).text().trim();
      const href = $(el).attr("href") || "";
      if (text && href && text.length > 3 && text.length < 100 && href.startsWith("http")) {
        links.push({ text, href });
      }
    });

    const mainHtml = contentRoot.html() || "";
    // Convert to markdown
    // Slight clean: remove attributes clutter via cheerio already
    let markdown = "";
    try {
      markdown = turndown.turndown(mainHtml);
      // Clean excessive newlines
      markdown = markdown.replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
    } catch {
      markdown = contentRoot.text().trim().slice(0, 20000);
    }

    // Text version
    let text = contentRoot.text();
    text = text
      .replace(/\s+/g, " ")
      .replace(/ \n /g, "\n")
      .trim()
      .slice(0, 20000);

    const result: ScrapedPage = {
      url,
      title: title.slice(0, 300),
      description: description.slice(0, 500),
      text,
      markdown,
      headings: headings.slice(0, 20),
      links,
      wordCount: text.split(/\s+/).length,
      scrapedAt: new Date().toISOString(),
    };

    pageCache.set(url, { content: result, timestamp: Date.now() });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Insight extraction (heuristic, no LLM needed but very useful) ---
function extractInsights(content: string, goal?: string) {
  const sentences = content.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const words = content.split(/\s+/);
  const wordCount = words.length;

  // Extract potential entities: Capitalized phrases 2-4 words
  const entityRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  const entities = Array.from(new Set(content.match(entityRegex) || [])).slice(0, 20);

  // Numbers / stats
  const statRegex = /\b(\d+(?:\.\d+)?%|\$[\d,.]+[BMK]?|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|trillion|users|dollars|percent)?)\b/gi;
  const stats = Array.from(new Set(content.match(statRegex) || [])).slice(0, 15);

  // Key points: longest sentences with keywords
  const keywords = goal ? goal.toLowerCase().split(/\s+/) : ["important", "key", "significant", "major", "result", "found", "shows", "research", "study", "analysis"];
  const scored = sentences.map((s) => {
    let score = s.length / 10;
    keywords.forEach((kw) => {
      if (s.toLowerCase().includes(kw)) score += 10;
    });
    if (/\d/.test(s)) score += 5;
    return { sentence: s, score };
  });
  const keyPoints = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.sentence);

  // Questions the content answers
  const questionIndicators = content.match(/\b(what|why|how|when|where|who)\b.*?\?/gi)?.slice(0, 5) || [];

  return {
    wordCount,
    entities,
    stats,
    keyPoints,
    questionsAnswered: questionIndicators,
    estimatedReadingTime: Math.ceil(wordCount / 230) + " min",
  };
}

// --- Main server ---
const server = new McpServer({
  name: "deep-research-mcp",
  version: "1.0.0",
});

// --- RESOURCES ---
server.resource(
  "research-memory",
  "research://memory",
  {
    description: "Persistent research memory - all saved findings, facts, tags",
    mimeType: "application/json",
  },
  async (uri) => {
    const data = await loadMemory();
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(data, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

server.resource(
  "research-history",
  "research://history",
  {
    description: "History of all researches, searches, fact-checks",
    mimeType: "application/json",
  },
  async (uri) => {
    const data = await loadHistory();
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(data, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

server.resource(
  "research-stats",
  "research://stats",
  {
    description: "Stats about research usage, cache, data dir",
    mimeType: "application/json",
  },
  async (uri) => {
    const mem = await loadMemory();
    const hist = await loadHistory();
    const stats = {
      memories: mem.memories.length,
      history: hist.history.length,
      cacheSize: pageCache.size,
      dataDir: DATA_DIR,
      uptime: process.uptime(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    };
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(stats, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

// --- PROMPTS ---
server.prompt(
  "deep-dive-research",
  "Create a deep research workflow prompt for a topic",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a deep research assistant. Use the MCP tools in this order for any research topic:

1. search_web for the topic to get 5-8 sources
2. deep_research to orchestrate parallel scraping + synthesis
3. If there are contradictions, use compare_sources on top 3 URLs
4. Save key findings with memory_save with tags
5. Produce final report with:
   - Executive summary (2-3 lines)
   - Key findings (bullets with sources)
   - Numbers/stats
   - Contradictions / gaps
   - Open questions
   - Sources list

Always cite URLs. Do not hallucinate. If search returns no results, say so.`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "fact-check",
  "Fact-checking squad prompt",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a fact-checker. When given a claim:
1. Use fact_check_claim tool
2. Use compare_sources if multiple narratives exist
3. Use memory_search to see if we already checked it
4. Verdict must be: SUPPORTED / CONTRADICTED / INCONCLUSIVE / MISLEADING with confidence % and evidence bullets each with URL
Never give verdict without searching.`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "compare-narratives",
  "Compare multiple sources/articles for bias and consensus",
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `When comparing sources:
1. Use compare_sources with 2-5 URLs
2. Extract for each: main thesis, supporting evidence, omitted points
3. Create table: | Aspect | Source A | Source B | Consensus? |
4. Highlight contradictions and explain why they might differ (date, bias, data source)
5. Give neutral synthesis.`,
          },
        },
      ],
    };
  }
);

// --- TOOLS ---

// 1. search_web
server.tool(
  "search_web",
  "Search the web using DuckDuckGo HTML (no API key needed). Returns titles, URLs, snippets.",
  {
    query: z.string().describe("Search query, be specific"),
    count: z.number().min(1).max(10).default(5).describe("Number of results (1-10)"),
    timeFilter: z.enum(["all", "day", "week", "month", "year"]).default("all").optional().describe("Time filter appended to query if needed"),
  },
  async ({ query, count, timeFilter }) => {
    let finalQuery = query;
    if (timeFilter && timeFilter !== "all") {
      finalQuery += ` ${timeFilter}`;
    }
    const results = await searchDuckDuckGo(finalQuery, count);
    await addHistory({
      type: "search",
      query: finalQuery,
      resultSummary: `Found ${results.length} results`,
      sources: results.map((r) => r.url),
    });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No results found for "${finalQuery}". Try broader query or different keywords.` }],
      };
    }

    const formatted = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}\n`)
      .join("\n");

    return {
      content: [{ type: "text", text: `Search results for "${finalQuery}" (${results.length}):\n\n${formatted}` }],
    };
  }
);

// 2. scrape_page
server.tool(
  "scrape_page",
  "Scrape and extract content from a URL. Returns markdown, text, headings, links. Auto-cached 10min.",
  {
    url: z.string().url().describe("URL to scrape"),
    format: z.enum(["markdown", "text", "full"]).default("markdown").describe("Output format"),
    extractMainOnly: z.boolean().default(true).describe("Try to extract main article content only, removing nav/footer"),
  },
  async ({ url, format, extractMainOnly }) => {
    try {
      const page = await scrapePage(url, extractMainOnly);
      await addHistory({
        type: "scrape",
        query: url,
        resultSummary: `Scraped ${page.wordCount} words, title: ${page.title}`,
        sources: [url],
      });

      let output = "";
      if (format === "text") {
        output = `# ${page.title}\n${page.description ? `> ${page.description}\n` : ""}\nURL: ${page.url}\nWords: ${page.wordCount}\n\n${page.text}`;
      } else if (format === "full") {
        output = JSON.stringify(page, null, 2);
      } else {
        output = `# ${page.title}\n\n${page.description ? `> ${page.description}\n\n` : ""}**URL:** ${page.url}\n**Words:** ${page.wordCount} | **Scraped:** ${page.scrapedAt}\n\n## Headings\n${page.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n") || "No headings"}\n\n## Content\n\n${page.markdown}\n\n## Links (top)\n${page.links.map((l) => `- [${l.text}](${l.href})`).join("\n") || "None"}`;
      }

      return { content: [{ type: "text", text: output }] };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Failed to scrape ${url}: ${e.message}` }],
        isError: true,
      };
    }
  }
);

// 3. extract_insights
server.tool(
  "extract_insights",
  "Extract key points, entities, stats, reading time from any text/content. Useful after scraping.",
  {
    content: z.string().min(50).describe("Content to analyze (scraped page text, article, etc)"),
    goal: z.string().optional().describe("What are you trying to extract? e.g. 'pricing for LLMs', 'side effects' - biases scoring"),
  },
  async ({ content, goal }) => {
    const insights = extractInsights(content, goal);
    const out = `# Insights ${goal ? `for: ${goal}` : ""}

**Word Count:** ${insights.wordCount} | **Reading:** ${insights.estimatedReadingTime}

## Key Points (top 8)
${insights.keyPoints.map((k, i) => `${i + 1}. ${k}`).join("\n")}

## Entities Detected
${insights.entities.map((e) => `- ${e}`).join("\n") || "None"}

## Stats / Numbers
${insights.stats.map((s) => `- ${s}`).join("\n") || "None"}

## Questions Answered
${insights.questionsAnswered.map((q) => `- ${q}`).join("\n") || "None"}

---
Raw length analyzed: ${content.length} chars
`;
    return { content: [{ type: "text", text: out }] };
  }
);

// 4. deep_research
server.tool(
  "deep_research",
  "Orchestrated deep research: search + parallel scrape top N + synthesize report. Saves to history. THIS IS THE POWER TOOL.",
  {
    topic: z.string().describe("Research topic/question"),
    depth: z.enum(["quick", "standard", "deep"]).default("standard").describe("quick=3 sources, standard=5, deep=8"),
    maxSources: z.number().min(1).max(10).optional().describe("Override number of sources (1-10)"),
    saveMemory: z.boolean().default(true).describe("Save key findings to memory"),
  },
  async ({ topic, depth, maxSources, saveMemory: shouldSave }) => {
    const sourceCount = maxSources || (depth === "quick" ? 3 : depth === "deep" ? 8 : 5);
    console.error(`[deep_research] Starting "${topic}" depth=${depth} sources=${sourceCount}`);

    // Step 1 search
    const searchResults = await searchDuckDuckGo(topic, sourceCount);
    if (searchResults.length === 0) {
      return {
        content: [{ type: "text", text: `Deep research failed: no search results for "${topic}". Try broader terms.` }],
      };
    }

    // Step 2 parallel scrape with concurrency limit 3
    const scraped: ScrapedPage[] = [];
    const failed: string[] = [];
    const queue = [...searchResults];
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          const page = await scrapePage(item.url, true);
          scraped.push(page);
        } catch (e: any) {
          failed.push(`${item.url}: ${e.message}`);
        }
      }
    });
    await Promise.all(workers);

    console.error(`[deep_research] Scraped ${scraped.length}/${searchResults.length}`);

    // Step 3 synthesize
    const allText = scraped.map((p) => p.text).join("\n\n");
    const insights = extractInsights(allText, topic);

    // Build report
    const report = `# Deep Research Report: ${topic}

**Depth:** ${depth} | **Sources analyzed:** ${scraped.length}/${searchResults.length} | **Date:** ${new Date().toISOString()}
**Failed scrapes:** ${failed.length > 0 ? failed.join("; ") : "None"}

## Executive Summary
Synthesized from ${scraped.length} sources totaling ~${insights.wordCount} words. Primary focus: ${topic}.

## Key Findings
${insights.keyPoints.map((p, i) => `${i + 1}. **${p}**`).join("\n")}

## Important Entities
${insights.entities.slice(0, 10).map((e) => `- ${e}`).join("\n")}

## Numbers & Stats Found
${insights.stats.map((s) => `- ${s}`).join("\n") || "- No clear stats extracted"}

## Sources Breakdown
${scraped
  .map(
    (p, i) =>
      `### ${i + 1}. ${p.title}
- **URL:** ${p.url}
- **Words:** ${p.wordCount}
- **Summary:** ${p.description || p.text.slice(0, 200) + "..."}
- **Headings:** ${p.headings
        .slice(0, 3)
        .map((h) => h.text)
        .join(" | ")}`
  )
  .join("\n\n")}

## Contradictions / Gaps to Investigate
${failed.length > 0 ? `- Could not access ${failed.length} sources, results may be incomplete\n` : ""}- Sources may have publication date differences - verify recency
- Cross-check stats: ${insights.stats.slice(0, 3).join(", ") || "no stats to cross-check"}
- ${insights.questionsAnswered.length > 0 ? "Questions still open: " + insights.questionsAnswered.join("; ") : "No explicit open questions found in content"}

## Open Questions
- What is the most recent data beyond these ${scraped.length} sources?
- Are there contradictory viewpoints not captured in top search results?
- What primary sources underlie the claims in these summaries?

## All URLs
${searchResults.map((r) => `- [${r.title}](${r.url})`).join("\n")}

---
Generated by deep-research-mcp | Reading time ~${insights.estimatedReadingTime}
`;

    await addHistory({
      type: "research",
      query: topic,
      resultSummary: `Deep research depth=${depth} with ${scraped.length} sources, ${insights.wordCount} words`,
      sources: scraped.map((s) => s.url),
    });

    if (shouldSave) {
      const mem = await loadMemory();
      const newItem: MemoryItem = {
        id: Date.now().toString(36),
        key: `research:${topic.slice(0, 50)}`,
        value: `Finding: ${insights.keyPoints.slice(0, 3).join(" | ")} Stats: ${insights.stats.slice(0, 3).join(", ")} Sources: ${scraped.length}`,
        tags: ["research", "auto", topic.split(" ").slice(0, 3).join("-").toLowerCase()],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: "deep_research",
      };
      mem.memories.unshift(newItem);
      await saveMemory(mem);
    }

    return { content: [{ type: "text", text: report }] };
  }
);

// 5. compare_sources
server.tool(
  "compare_sources",
  "Compare 2-5 URLs for consensus, contradictions, unique insights. Scrapes in parallel.",
  {
    urls: z.array(z.string().url()).min(2).max(5).describe("2-5 URLs to compare"),
    focus: z.string().optional().describe("What aspect to focus comparison on? e.g. 'pricing', 'effectiveness'"),
  },
  async ({ urls, focus }) => {
    console.error(`[compare] ${urls.join(", ")} focus=${focus}`);
    const pages: ScrapedPage[] = [];
    const errors: string[] = [];

    await Promise.all(
      urls.map(async (url) => {
        try {
          const p = await scrapePage(url, true);
          pages.push(p);
        } catch (e: any) {
          errors.push(`${url}: ${e.message}`);
        }
      })
    );

    if (pages.length < 2) {
      return {
        content: [{ type: "text", text: `Could not compare, only ${pages.length} succeeded. Errors: ${errors.join("; ")}` }],
        isError: true,
      };
    }

    // Simple overlap analysis
    const insightsPerPage = pages.map((p) => ({
      url: p.url,
      title: p.title,
      insights: extractInsights(p.text, focus),
      text: p.text,
    }));

    // Find common entities
    const allEntities = insightsPerPage.flatMap((i) => i.insights.entities);
    const entityCount = new Map<string, number>();
    allEntities.forEach((e) => entityCount.set(e, (entityCount.get(e) || 0) + 1));
    const commonEntities = Array.from(entityCount.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([e, c]) => `${e} (${c}/${pages.length} sources)`);

    const report = `# Source Comparison ${focus ? `for: ${focus}` : ""}

**Compared:** ${pages.length} sources | **Errors:** ${errors.length}
Date: ${new Date().toISOString()}

## Sources
${pages.map((p, i) => `${i + 1}. **${p.title}**\n   - URL: ${p.url}\n   - Words: ${p.wordCount}`).join("\n")}

## Consensus - Common Entities/Themes
${commonEntities.map((e) => `- ${e}`).join("\n") || "No strong common entities"}

## Per-Source Key Points
${insightsPerPage
  .map(
    (ip, i) => `### Source ${i + 1}: ${ip.title}
**URL:** ${ip.url}
- ${ip.insights.keyPoints.slice(0, 3).join("\n- ") }
- Stats: ${ip.insights.stats.slice(0, 3).join(", ") || "None"}
`
  )
  .join("\n")}

## Contradictions / Differences (heuristic)
- Different word counts and focus: ${pages.map((p) => `${p.wordCount} words`).join(" vs ")}
- Unique entities per source:
${insightsPerPage
  .map((ip) => {
    const unique = ip.insights.entities.filter((e) => (entityCount.get(e) || 0) === 1);
    return `- ${ip.title.slice(0, 40)}: ${unique.slice(0, 5).join(", ") || "none"}`;
  })
  .join("\n")}

## Unique Insights
${insightsPerPage
  .map((ip, idx) => `**Source ${idx + 1} unique:** ${ip.insights.keyPoints[0] || "No distinct point"}`)
  .join("\n")}

## Synthesis
${focus ? `On ${focus}:` : "Overall:"} The ${pages.length} sources share ${commonEntities.length} common themes. ${pages.length === urls.length ? "All URLs succeeded" : `${errors.length} failed: ${errors.join("; ")}`}. Recommend follow-up with deep_research on ${focus || "core claims"}.

---
Errors: ${errors.join("; ") || "None"}
`;

    await addHistory({
      type: "compare",
      query: focus || urls.join(", "),
      resultSummary: `Compared ${pages.length} sources, found ${commonEntities.length} common themes`,
      sources: pages.map((p) => p.url),
    });

    return { content: [{ type: "text", text: report }] };
  }
);

// 6. fact_check_claim
server.tool(
  "fact_check_claim",
  "Fact-check a claim: searches evidence for and against, scrapes, gives verdict with confidence.",
  {
    claim: z.string().min(10).describe("Claim to fact-check, e.g. 'Dehradun is the capital of Uttarakhand'"),
    searchDepth: z.number().min(2).max(8).default(5).describe("How many sources to check"),
  },
  async ({ claim, searchDepth }) => {
    console.error(`[fact_check] ${claim}`);

    // Search for claim and counter-claim
    const [supportSearch, counterSearch] = await Promise.all([
      searchDuckDuckGo(claim, searchDepth),
      searchDuckDuckGo(`${claim} debunked OR false OR myth`, Math.ceil(searchDepth / 2)),
    ]);

    const combined = [...supportSearch];
    // Add counter results if not duplicate
    for (const r of counterSearch) {
      if (!combined.some((c) => c.url === r.url)) combined.push(r);
    }

    const toScrape = combined.slice(0, searchDepth);
    const scraped: ScrapedPage[] = [];
    for (const r of toScrape) {
      try {
        const p = await scrapePage(r.url, true);
        scraped.push(p);
      } catch {}
    }

    // Simple heuristic scoring: count claim keywords in pages
    const claimKeywords = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    let supportScore = 0;
    let contradictScore = 0;
    const evidence: { url: string; title: string; snippet: string; stance: string }[] = [];

    const negations = ["not", "false", "no ", "myth", "debunked", "incorrect", "never"];

    for (const page of scraped) {
      const lower = page.text.toLowerCase();
      const matches = claimKeywords.filter((kw) => lower.includes(kw)).length;
      const hasNegation = negations.some((n) => lower.includes(n) && claimKeywords.some((kw) => lower.includes(kw)));
      if (matches >= Math.ceil(claimKeywords.length * 0.5)) {
        if (hasNegation) {
          contradictScore++;
          evidence.push({ url: page.url, title: page.title, snippet: page.text.slice(0, 250), stance: "POTENTIALLY CONTRADICTS" });
        } else {
          supportScore++;
          evidence.push({ url: page.url, title: page.title, snippet: page.text.slice(0, 250), stance: "POTENTIALLY SUPPORTS" });
        }
      }
    }

    let verdict = "INCONCLUSIVE";
    let confidence = 30;
    if (supportScore > contradictScore && supportScore >= 2) {
      verdict = "SUPPORTED";
      confidence = Math.min(85, 50 + supportScore * 10);
    } else if (contradictScore > supportScore) {
      verdict = "CONTRADICTED";
      confidence = Math.min(85, 50 + contradictScore * 10);
    } else if (supportScore === 0 && contradictScore === 0) {
      verdict = "INCONCLUSIVE";
      confidence = 20;
    } else {
      verdict = "MIXED";
      confidence = 45;
    }

    const memSearch = await loadMemory();
    const relatedMem = memSearch.memories.filter((m) => claimKeywords.some((kw) => m.value.toLowerCase().includes(kw) || m.key.toLowerCase().includes(kw))).slice(0, 3);

    const report = `# Fact-Check Report

**Claim:** "${claim}"

**Verdict:** **${verdict}** (${confidence}% confidence)
**Checked:** ${new Date().toISOString()} | **Sources analyzed:** ${scraped.length}

## Scoring
- Supporting indicators: ${supportScore}
- Contradicting indicators: ${contradictScore}
- Sources searched: ${toScrape.length}

## Evidence
${evidence
  .map(
    (e, i) => `${i + 1}. **${e.stance}** - ${e.title}
   URL: ${e.url}
   Snippet: ${e.snippet.replace(/\n/g, " ").slice(0, 300)}...`
  )
  .join("\n\n") || "No direct evidence snippets extracted"}

## Related Memory (if any)
${relatedMem.map((m) => `- [${m.key}] ${m.value} (tags: ${m.tags.join(", ")})`).join("\n") || "None"}

## Limitations
- This is a heuristic fact-check using web search + keyword matching, not a human expert review
- ${combined.length - scraped.length} search results could not be scraped
- Sources may be outdated - verify dates
- For high-stakes claims, manually review primary sources: ${toScrape.map((s) => s.url).join(", ")}

## Recommendation
${verdict === "SUPPORTED" ? "Claim appears supported by current open sources, but verify primary source dates." : verdict === "CONTRADICTED" ? "Claim appears contradicted by some sources - investigate further with primary data." : "Not enough clear evidence - try more specific search terms or check academic sources."}

---
Search URLs attempted:
${combined.map((r) => `- ${r.url} (${r.title})`).join("\n")}
`;

    await addHistory({
      type: "fact_check",
      query: claim,
      resultSummary: `Verdict ${verdict} ${confidence}% with ${evidence.length} evidence pieces`,
      sources: scraped.map((s) => s.url),
    });

    return { content: [{ type: "text", text: report }] };
  }
);

// 7. memory_save
server.tool(
  "memory_save",
  "Save a finding, fact, note to persistent memory. Survives restarts.",
  {
    key: z.string().describe("Key/title, e.g. 'dehradun-capital-fact' or 'pricing-openai'"),
    value: z.string().describe("Value/content to save"),
    tags: z.array(z.string()).default([]).describe("Tags for filtering"),
    source: z.string().optional().describe("Source URL or description"),
  },
  async ({ key, value, tags, source }) => {
    const data = await loadMemory();
    const existingIdx = data.memories.findIndex((m) => m.key === key);
    const now = new Date().toISOString();
    const item: MemoryItem = {
      id: existingIdx >= 0 ? data.memories[existingIdx].id : Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      key,
      value,
      tags,
      createdAt: existingIdx >= 0 ? data.memories[existingIdx].createdAt : now,
      updatedAt: now,
      source,
    };
    if (existingIdx >= 0) {
      data.memories[existingIdx] = item;
    } else {
      data.memories.unshift(item);
    }
    await saveMemory(data);
    return { content: [{ type: "text", text: `Saved memory: ${key}\nID: ${item.id}\nTags: ${tags.join(", ")}\nTotal memories: ${data.memories.length}` }] };
  }
);

// 8. memory_search
server.tool(
  "memory_search",
  "Search persistent memory by keyword and tags. Fuzzy text search.",
  {
    query: z.string().describe("Search query in keys/values/tags"),
    tags: z.array(z.string()).optional().describe("Filter by tags (any match)"),
    limit: z.number().min(1).max(20).default(10).describe("Max results"),
  },
  async ({ query, tags, limit }) => {
    const data = await loadMemory();
    const q = query.toLowerCase();
    let filtered = data.memories.filter((m) => m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));

    if (tags && tags.length > 0) {
      const lowerTags = tags.map((t) => t.toLowerCase());
      filtered = filtered.filter((m) => m.tags.some((t) => lowerTags.includes(t.toLowerCase())));
    }

    const limited = filtered.slice(0, limit);
    if (limited.length === 0) {
      return { content: [{ type: "text", text: `No memories found for "${query}"${tags ? ` with tags ${tags.join(", ")}` : ""}. Total memories: ${data.memories.length}` }] };
    }

    const out = `Found ${limited.length}/${filtered.length} memories for "${query}" (total ${data.memories.length}):\n\n${limited
      .map(
        (m) => `**${m.key}** (ID: ${m.id})\n- Value: ${m.value.slice(0, 500)}\n- Tags: ${m.tags.join(", ") || "none"}\n- Source: ${m.source || "none"}\n- Updated: ${m.updatedAt}\n`
      )
      .join("\n---\n")}`;

    return { content: [{ type: "text", text: out }] };
  }
);

// --- Start server ---
async function main() {
  await ensureDataDir();
  console.error(`[deep-research-mcp] Data dir: ${DATA_DIR}`);
  console.error(`[deep-research-mcp] Starting...`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[deep-research-mcp] Running on stdio. Ready for deep research!`);
}

main().catch((e) => {
  console.error("[deep-research-mcp] Fatal:", e);
  process.exit(1);
});
