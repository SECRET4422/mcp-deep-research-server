import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import fs from "fs/promises";
import path from "path";
import os from "os";

const DATA_DIR = path.join(os.homedir(), ".mcp-deep-research");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const CACHE_DIR = path.join(DATA_DIR, "cache");

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", emDelimiter: "*" });
const pageCache = new Map<string, { content: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

type MemoryItem = { id: string; key: string; value: string; tags: string[]; createdAt: string; updatedAt: string; source?: string; };
type HistoryItem = { id: string; type: "search" | "research" | "scrape" | "fact_check" | "compare"; query: string; timestamp: string; resultSummary: string; sources?: string[]; };

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(CACHE_DIR, { recursive: true });
    try { await fs.access(MEMORY_FILE); } catch { await fs.writeFile(MEMORY_FILE, JSON.stringify({ memories: [], version: 1 }, null, 2)); }
    try { await fs.access(HISTORY_FILE); } catch { await fs.writeFile(HISTORY_FILE, JSON.stringify({ history: [], version: 1 }, null, 2)); }
  } catch (e) { console.error("[deep-research] Failed to ensure data dir:", e); }
}
async function loadMemory(): Promise<{ memories: MemoryItem[] }> {
  await ensureDataDir();
  try { const data = await fs.readFile(MEMORY_FILE, "utf-8"); return JSON.parse(data); } catch { return { memories: [] }; }
}
async function saveMemory(data: { memories: MemoryItem[] }) { await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2)); }
async function loadHistory(): Promise<{ history: HistoryItem[] }> {
  await ensureDataDir();
  try { const data = await fs.readFile(HISTORY_FILE, "utf-8"); return JSON.parse(data); } catch { return { history: [] }; }
}
async function saveHistory(data: { history: HistoryItem[] }) { await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2)); }
async function addHistory(item: Omit<HistoryItem, "id" | "timestamp">) {
  const { history } = await loadHistory();
  history.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), timestamp: new Date().toISOString(), ...item });
  const trimmed = history.slice(0, 100);
  await saveHistory({ history: trimmed });
}

interface SearchResult { title: string; url: string; snippet: string; source: string; }
async function searchDuckDuckGo(query: string, count: number = 5): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36", Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    $(".result").each((i: any, el: any) => {
      if (results.length >= count) return false;
      const titleEl = $(el).find(".result__a");
      const snippetEl = $(el).find(".result__snippet");
      const urlEl = $(el).find(".result__url");
      let title = titleEl.text().trim();
      let href = titleEl.attr("href") || "";
      let snippet = snippetEl.text().trim();
      if (href.startsWith("/l/") || href.includes("uddg=")) {
        try { const urlParams = new URL(href, "https://duckduckgo.com").searchParams; const uddg = urlParams.get("uddg"); if (uddg) href = decodeURIComponent(uddg); } catch {}
      } else if (href.startsWith("//")) href = "https:" + href;
      else if (href.startsWith("/")) { const textUrl = urlEl.text().trim(); if (textUrl) href = textUrl.startsWith("http") ? textUrl : "https://" + textUrl; }
      if (title && href && href.startsWith("http")) results.push({ title: title.slice(0, 200), url: href, snippet: snippet.slice(0, 400), source: "duckduckgo" });
    });
    if (results.length === 0) {
      $(".result__body").each((i: any, el: any) => {
        if (results.length >= count) return false;
        const titleEl = $(el).find(".result__a").first();
        let title = titleEl.text().trim();
        let href = titleEl.attr("href") || "";
        let snippet = $(el).find(".result__snippet").text().trim();
        if (href.includes("uddg=")) { try { const u = new URL(href, "https://duckduckgo.com").searchParams.get("uddg"); if (u) href = decodeURIComponent(u); } catch {} }
        if (title && href && href.startsWith("http")) results.push({ title, url: href, snippet, source: "duckduckgo" });
      });
    }
    return results;
  } catch (e: any) { console.error("[search] Failed:", e.message); return []; } finally { clearTimeout(timeout); }
}

interface ScrapedPage { url: string; title: string; description: string; text: string; markdown: string; headings: { level: number; text: string }[]; links: { text: string; href: string }[]; wordCount: number; scrapedAt: string; }
async function scrapePage(url: string, extractMainOnly = true): Promise<ScrapedPage> {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.content;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36", Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" }, signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      const text = await res.text();
      const result: ScrapedPage = { url, title: url, description: `Non-HTML: ${contentType}`, text: text.slice(0, 15000), markdown: text.slice(0, 15000), headings: [], links: [], wordCount: text.split(/\s+/).length, scrapedAt: new Date().toISOString() };
      pageCache.set(url, { content: result, timestamp: Date.now() });
      return result;
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    let title = $("title").first().text().trim() || $("h1").first().text().trim() || url;
    let description = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "";
    $("script, style, noscript, iframe, svg, canvas, form, button").remove();
    if (extractMainOnly) $("nav, header, footer, aside, .nav, .navbar, .sidebar, .comments, .comment, #comments, .advertisement, .ad, .ads").remove();
    let contentRoot: any = null;
    const candidates = ["article", "main", "[role=main]", ".post-content", ".article-content", ".entry-content", "#main-content", "#content", ".content"];
    for (const sel of candidates) { const el = $(sel).first(); if (el.length > 0 && el.text().trim().length > 200) { contentRoot = el; break; } }
    if (!contentRoot) contentRoot = $("body");
    const headings: { level: number; text: string }[] = [];
    contentRoot.find("h1, h2, h3").each((_: any, el: any) => { const tag = el.tagName.toLowerCase(); const level = parseInt(tag.replace("h", ""), 10); const text = $(el).text().trim(); if (text) headings.push({ level, text: text.slice(0, 200) }); });
    const links: { text: string; href: string }[] = [];
    contentRoot.find("a[href]").each((_: any, el: any) => { if (links.length >= 30) return false; const text = $(el).text().trim(); const href = $(el).attr("href") || ""; if (text && href && text.length > 3 && text.length < 100 && href.startsWith("http")) links.push({ text, href }); });
    const mainHtml = contentRoot.html() || "";
    let markdown = "";
    try { markdown = turndown.turndown(mainHtml).replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000); } catch { markdown = contentRoot.text().trim().slice(0, 20000); }
    let text = contentRoot.text().replace(/\s+/g, " ").replace(/ \n /g, "\n").trim().slice(0, 20000);
    const result: ScrapedPage = { url, title: title.slice(0, 300), description: description.slice(0, 500), text, markdown, headings: headings.slice(0, 20), links, wordCount: text.split(/\s+/).length, scrapedAt: new Date().toISOString() };
    pageCache.set(url, { content: result, timestamp: Date.now() });
    return result;
  } finally { clearTimeout(timeout); }
}

function extractInsights(content: string, goal?: string) {
  const sentences = content.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const words = content.split(/\s+/);
  const wordCount = words.length;
  const entityRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
  const entities = Array.from(new Set(content.match(entityRegex) || [])).slice(0, 20);
  const statRegex = /\b(\d+(?:\.\d+)?%|\$[\d,.]+[BMK]?|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|trillion|users|dollars|percent)?)\b/gi;
  const stats = Array.from(new Set(content.match(statRegex) || [])).slice(0, 15);
  const keywords = goal ? goal.toLowerCase().split(/\s+/) : ["important", "key", "significant", "major", "result", "found", "shows", "research", "study", "analysis"];
  const scored = sentences.map((s) => { let score = s.length / 10; keywords.forEach((kw) => { if (s.toLowerCase().includes(kw)) score += 10; }); if (/\d/.test(s)) score += 5; return { sentence: s, score }; });
  const keyPoints = scored.sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.sentence);
  const questionIndicators = content.match(/\b(what|why|how|when|where|who)\b.*?\?/gi)?.slice(0, 5) || [];
  return { wordCount, entities, stats, keyPoints, questionsAnswered: questionIndicators, estimatedReadingTime: Math.ceil(wordCount / 230) + " min" };
}

export function createMcpServer() {
  const server = new McpServer({ name: "deep-research-mcp", version: "1.3.0" });

  server.resource("research-memory", "research://memory", { description: "Persistent research memory", mimeType: "application/json" }, async (uri) => {
    const data = await loadMemory();
    return { contents: [{ uri: uri.href, text: JSON.stringify(data, null, 2), mimeType: "application/json" }] };
  });
  server.resource("research-history", "research://history", { description: "History of all researches", mimeType: "application/json" }, async (uri) => {
    const data = await loadHistory();
    return { contents: [{ uri: uri.href, text: JSON.stringify(data, null, 2), mimeType: "application/json" }] };
  });
  server.resource("research-stats", "research://stats", { description: "Stats", mimeType: "application/json" }, async (uri) => {
    const mem = await loadMemory(); const hist = await loadHistory();
    const stats = { memories: mem.memories.length, history: hist.history.length, cacheSize: pageCache.size, dataDir: DATA_DIR, uptime: process.uptime(), nodeVersion: process.version, timestamp: new Date().toISOString() };
    return { contents: [{ uri: uri.href, text: JSON.stringify(stats, null, 2), mimeType: "application/json" }] };
  });

  server.prompt("deep-dive-research", "Create a deep research workflow", async () => ({
    messages: [{ role: "user", content: { type: "text", text: `You are a deep research assistant. Use MCP tools in order: 1. search_web 2. deep_research 3. compare_sources if contradictions 4. memory_save 5. Final report with summary, findings, stats, gaps, sources. Cite URLs.` } }]
  }));
  server.prompt("fact-check", "Fact-checking squad", async () => ({
    messages: [{ role: "user", content: { type: "text", text: `Fact-checker: Use fact_check_claim, compare_sources if needed, memory_search. Verdict: SUPPORTED/CONTRADICTED/INCONCLUSIVE/MISLEADING with % and evidence URLs.` } }]
  }));
  server.prompt("compare-narratives", "Compare sources", async () => ({
    messages: [{ role: "user", content: { type: "text", text: `Compare 2-5 URLs: thesis, evidence, omitted. Table | Aspect | A | B | Consensus? | Highlight contradictions, give neutral synthesis.` } }]
  }));

  server.tool("search_web", "Search web via DuckDuckGo HTML (no API key)", { query: z.string().describe("Search query"), count: z.number().min(1).max(10).default(5), timeFilter: z.enum(["all", "day", "week", "month", "year"]).default("all").optional() }, async ({ query, count, timeFilter }) => {
    let finalQuery = query; if (timeFilter && timeFilter !== "all") finalQuery += ` ${timeFilter}`;
    const results = await searchDuckDuckGo(finalQuery, count);
    await addHistory({ type: "search", query: finalQuery, resultSummary: `Found ${results.length} results`, sources: results.map((r) => r.url) });
    if (results.length === 0) return { content: [{ type: "text", text: `No results for "${finalQuery}".` }] };
    const formatted = results.map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}\n`).join("\n");
    return { content: [{ type: "text", text: `Search results for "${finalQuery}" (${results.length}):\n\n${formatted}` }] };
  });

  server.tool("scrape_page", "Scrape URL to markdown", { url: z.string().url(), format: z.enum(["markdown", "text", "full"]).default("markdown"), extractMainOnly: z.boolean().default(true) }, async ({ url, format, extractMainOnly }) => {
    try {
      const page = await scrapePage(url, extractMainOnly);
      await addHistory({ type: "scrape", query: url, resultSummary: `Scraped ${page.wordCount} words`, sources: [url] });
      let output = "";
      if (format === "text") output = `# ${page.title}\n${page.description ? `> ${page.description}\n` : ""}\nURL: ${page.url}\nWords: ${page.wordCount}\n\n${page.text}`;
      else if (format === "full") output = JSON.stringify(page, null, 2);
      else output = `# ${page.title}\n\n${page.description ? `> ${page.description}\n\n` : ""}**URL:** ${page.url}\n**Words:** ${page.wordCount}\n\n## Headings\n${page.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n") || "None"}\n\n## Content\n\n${page.markdown}\n\n## Links\n${page.links.map((l) => `- [${l.text}](${l.href})`).join("\n") || "None"}`;
      return { content: [{ type: "text", text: output }] };
    } catch (e: any) { return { content: [{ type: "text", text: `Failed to scrape ${url}: ${e.message}` }], isError: true }; }
  });

  server.tool("extract_insights", "Extract insights", { content: z.string().min(50), goal: z.string().optional() }, async ({ content, goal }) => {
    const insights = extractInsights(content, goal);
    const out = `# Insights ${goal ? `for: ${goal}` : ""}\n\n**Words:** ${insights.wordCount} | **Reading:** ${insights.estimatedReadingTime}\n\n## Key Points\n${insights.keyPoints.map((k, i) => `${i + 1}. ${k}`).join("\n")}\n\n## Entities\n${insights.entities.map((e) => `- ${e}`).join("\n") || "None"}\n\n## Stats\n${insights.stats.map((s) => `- ${s}`).join("\n") || "None"}\n\n## Questions\n${insights.questionsAnswered.map((q) => `- ${q}`).join("\n") || "None"}\n`;
    return { content: [{ type: "text", text: out }] };
  });

  server.tool("deep_research", "Orchestrated deep research: search + parallel scrape + synthesize", { topic: z.string(), depth: z.enum(["quick", "standard", "deep"]).default("standard"), maxSources: z.number().min(1).max(10).optional(), saveMemory: z.boolean().default(true) }, async ({ topic, depth, maxSources, saveMemory: shouldSave }) => {
    const sourceCount = maxSources || (depth === "quick" ? 3 : depth === "deep" ? 8 : 5);
    const searchResults = await searchDuckDuckGo(topic, sourceCount);
    if (searchResults.length === 0) return { content: [{ type: "text", text: `No results for "${topic}".` }] };
    const scraped: ScrapedPage[] = []; const failed: string[] = []; const queue = [...searchResults];
    const workers = Array.from({ length: 3 }, async () => { while (queue.length > 0) { const item = queue.shift(); if (!item) break; try { const page = await scrapePage(item.url, true); scraped.push(page); } catch (e: any) { failed.push(`${item.url}: ${e.message}`); } } });
    await Promise.all(workers);
    const allText = scraped.map((p) => p.text).join("\n\n");
    const insights = extractInsights(allText, topic);
    const report = `# Deep Research: ${topic}\n\n**Depth:** ${depth} | **Sources:** ${scraped.length}/${searchResults.length} | **Date:** ${new Date().toISOString()}\n\n## Executive Summary\nFrom ${scraped.length} sources ~${insights.wordCount} words. Focus: ${topic}.\n\n## Key Findings\n${insights.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n## Entities\n${insights.entities.slice(0, 10).map((e) => `- ${e}`).join("\n")}\n\n## Stats\n${insights.stats.map((s) => `- ${s}`).join("\n") || "- None"}\n\n## Sources\n${scraped.map((p, i) => `### ${i + 1}. ${p.title}\n- URL: ${p.url}\n- Words: ${p.wordCount}\n- Summary: ${p.description || p.text.slice(0, 200)}`).join("\n\n")}\n\n## Gaps\n${failed.length > 0 ? `- Failed: ${failed.join("; ")}\n` : ""}- Verify recency, cross-check stats\n\n## All URLs\n${searchResults.map((r) => `- [${r.title}](${r.url})`).join("\n")}\n`;
    await addHistory({ type: "research", query: topic, resultSummary: `Deep research ${depth} ${scraped.length} sources`, sources: scraped.map((s) => s.url) });
    if (shouldSave) { const mem = await loadMemory(); mem.memories.unshift({ id: Date.now().toString(36), key: `research:${topic.slice(0, 50)}`, value: `Finding: ${insights.keyPoints.slice(0, 3).join(" | ")} Stats: ${insights.stats.slice(0, 3).join(", ")}`, tags: ["research", "auto", topic.split(" ").slice(0, 3).join("-").toLowerCase()], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "deep_research" }); await saveMemory(mem); }
    return { content: [{ type: "text", text: report }] };
  });

  server.tool("compare_sources", "Compare 2-5 URLs", { urls: z.array(z.string().url()).min(2).max(5), focus: z.string().optional() }, async ({ urls, focus }) => {
    const pages: ScrapedPage[] = []; const errors: string[] = [];
    await Promise.all(urls.map(async (url) => { try { const p = await scrapePage(url, true); pages.push(p); } catch (e: any) { errors.push(`${url}: ${e.message}`); } }));
    if (pages.length < 2) return { content: [{ type: "text", text: `Only ${pages.length} succeeded. Errors: ${errors.join("; ")}` }], isError: true };
    const insightsPerPage = pages.map((p) => ({ url: p.url, title: p.title, insights: extractInsights(p.text, focus), text: p.text }));
    const allEntities = insightsPerPage.flatMap((i) => i.insights.entities);
    const entityCount = new Map<string, number>(); allEntities.forEach((e) => entityCount.set(e, (entityCount.get(e) || 0) + 1));
    const commonEntities = Array.from(entityCount.entries()).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([e, c]) => `${e} (${c}/${pages.length})`);
    const report = `# Compare ${focus ? `for: ${focus}` : ""}\n\n**Compared:** ${pages.length} | **Errors:** ${errors.length}\n\n## Sources\n${pages.map((p, i) => `${i + 1}. **${p.title}**\n   - URL: ${p.url}\n   - Words: ${p.wordCount}`).join("\n")}\n\n## Consensus\n${commonEntities.map((e) => `- ${e}`).join("\n") || "None"}\n\n## Per-Source\n${insightsPerPage.map((ip, i) => `### Source ${i + 1}: ${ip.title}\n- ${ip.insights.keyPoints.slice(0, 3).join("\n- ")}\n`).join("\n")}\n\n## Unique\n${insightsPerPage.map((ip, idx) => `**Source ${idx + 1} unique:** ${ip.insights.keyPoints[0] || "None"}`).join("\n")}\n`;
    await addHistory({ type: "compare", query: focus || urls.join(", "), resultSummary: `Compared ${pages.length} sources`, sources: pages.map((p) => p.url) });
    return { content: [{ type: "text", text: report }] };
  });

  server.tool("fact_check_claim", "Fact-check claim", { claim: z.string().min(10), searchDepth: z.number().min(2).max(8).default(5) }, async ({ claim, searchDepth }) => {
    const [supportSearch, counterSearch] = await Promise.all([searchDuckDuckGo(claim, searchDepth), searchDuckDuckGo(`${claim} debunked OR false OR myth`, Math.ceil(searchDepth / 2))]);
    const combined = [...supportSearch]; for (const r of counterSearch) if (!combined.some((c) => c.url === r.url)) combined.push(r);
    const toScrape = combined.slice(0, searchDepth); const scraped: ScrapedPage[] = []; for (const r of toScrape) { try { const p = await scrapePage(r.url, true); scraped.push(p); } catch {} }
    const claimKeywords = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    let supportScore = 0; let contradictScore = 0; const evidence: { url: string; title: string; snippet: string; stance: string }[] = [];
    const negations = ["not", "false", "no ", "myth", "debunked", "incorrect", "never"];
    for (const page of scraped) {
      const lower = page.text.toLowerCase(); const matches = claimKeywords.filter((kw) => lower.includes(kw)).length; const hasNegation = negations.some((n) => lower.includes(n) && claimKeywords.some((kw) => lower.includes(kw)));
      if (matches >= Math.ceil(claimKeywords.length * 0.5)) { if (hasNegation) { contradictScore++; evidence.push({ url: page.url, title: page.title, snippet: page.text.slice(0, 250), stance: "POTENTIALLY CONTRADICTS" }); } else { supportScore++; evidence.push({ url: page.url, title: page.title, snippet: page.text.slice(0, 250), stance: "POTENTIALLY SUPPORTS" }); } }
    }
    let verdict = "INCONCLUSIVE"; let confidence = 30;
    if (supportScore > contradictScore && supportScore >= 2) { verdict = "SUPPORTED"; confidence = Math.min(85, 50 + supportScore * 10); }
    else if (contradictScore > supportScore) { verdict = "CONTRADICTED"; confidence = Math.min(85, 50 + contradictScore * 10); }
    else if (supportScore === 0 && contradictScore === 0) { verdict = "INCONCLUSIVE"; confidence = 20; } else { verdict = "MIXED"; confidence = 45; }
    const report = `# Fact-Check\n\n**Claim:** "${claim}"\n\n**Verdict:** **${verdict}** (${confidence}%)\n**Sources:** ${scraped.length}\n\n## Evidence\n${evidence.map((e, i) => `${i + 1}. **${e.stance}** - ${e.title}\n   URL: ${e.url}\n   ${e.snippet.slice(0, 300)}...`).join("\n\n") || "No evidence"}\n\n## Recommendation\n${verdict === "SUPPORTED" ? "Supported but verify primary source." : verdict === "CONTRADICTED" ? "Contradicted - investigate further." : "Not enough evidence."}\n`;
    await addHistory({ type: "fact_check", query: claim, resultSummary: `Verdict ${verdict} ${confidence}%`, sources: scraped.map((s) => s.url) });
    return { content: [{ type: "text", text: report }] };
  });

  server.tool("memory_save", "Save to persistent memory", { key: z.string(), value: z.string(), tags: z.array(z.string()).default([]), source: z.string().optional() }, async ({ key, value, tags, source }) => {
    const data = await loadMemory(); const existingIdx = data.memories.findIndex((m) => m.key === key); const now = new Date().toISOString();
    const item: MemoryItem = { id: existingIdx >= 0 ? data.memories[existingIdx].id : Date.now().toString(36) + Math.random().toString(36).slice(2, 4), key, value, tags, createdAt: existingIdx >= 0 ? data.memories[existingIdx].createdAt : now, updatedAt: now, source };
    if (existingIdx >= 0) data.memories[existingIdx] = item; else data.memories.unshift(item); await saveMemory(data);
    return { content: [{ type: "text", text: `Saved memory: ${key} ID: ${item.id} Total: ${data.memories.length}` }] };
  });

  server.tool("memory_search", "Search memory", { query: z.string(), tags: z.array(z.string()).optional(), limit: z.number().min(1).max(20).default(10) }, async ({ query, tags, limit }) => {
    const data = await loadMemory(); const q = query.toLowerCase();
    let filtered = data.memories.filter((m) => m.key.toLowerCase().includes(q) || m.value.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
    if (tags && tags.length > 0) { const lowerTags = tags.map((t) => t.toLowerCase()); filtered = filtered.filter((m) => m.tags.some((t) => lowerTags.includes(t.toLowerCase()))); }
    const limited = filtered.slice(0, limit);
    if (limited.length === 0) return { content: [{ type: "text", text: `No memories for "${query}". Total: ${data.memories.length}` }] };
    const out = `Found ${limited.length}/${filtered.length} for "${query}":\n\n${limited.map((m) => `**${m.key}** (ID: ${m.id})\n- ${m.value.slice(0, 500)}\n- Tags: ${m.tags.join(", ")}\n- Updated: ${m.updatedAt}\n`).join("\n---\n")}`;
    return { content: [{ type: "text", text: out }] };
  });

  return server;
}

export { ensureDataDir };
