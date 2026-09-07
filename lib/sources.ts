import { XMLParser } from "fast-xml-parser";
import { canonicalUrl, detectLanguage } from "./intelligence.ts";
import { fetchPublic, InputError, publicUrl } from "./safety.ts";
import type { Source } from "./types.ts";

export interface CollectedItem { title: string; url: string; text: string; publishedAt: string | null; language: string; scope: "feed-excerpt" | "article" }
export function decodeEntities(input: string): string {
  return input.replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
    const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
  }).replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/g, (_, key: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" }[key] ?? ""));
}
export function stripHtml(input: string): string {
  return decodeEntities(input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style|noscript|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return scalar((value as Record<string, unknown>)["#text"]);
  return "";
}
function list<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
export function parseDate(value: string, now = Date.now()): string | null {
  if (!value.trim()) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) && date <= now + 86400000 && date >= Date.UTC(1990, 0, 1) ? new Date(date).toISOString() : null;
}
export function parseFeed(xml: string, baseUrl: string, language = "en"): CollectedItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new InputError("XML document types and custom entities are not accepted.");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, processEntities: false, removeNSPrefix: false });
  const parsed = parser.parse(xml);
  const channel = parsed.rss?.channel;
  const entries = channel?.item ?? parsed.feed?.entry ?? parsed["rdf:RDF"]?.item;
  if (!entries && !channel && !parsed.feed) throw new InputError("This URL did not return an RSS or Atom feed. Use Discover feed for a publication, or Public page for one article.");
  return list<Record<string, unknown>>(entries).slice(0, 150).flatMap(item => {
    try {
      const links = list(item.link);
      const link = links.find(v => typeof v === "string" || (v && typeof v === "object" && (!v["@_rel" as keyof typeof v] || v["@_rel" as keyof typeof v] === "alternate")));
      const href = typeof link === "object" && link ? scalar((link as Record<string, unknown>)["@_href"]) : scalar(link);
      const url = canonicalUrl(publicUrl(new URL(decodeEntities(href || scalar(item.guid)), baseUrl).toString()).toString());
      const title = stripHtml(scalar(item.title)).slice(0, 500);
      if (!title || !href && !item.guid) return [];
      const text = stripHtml(scalar(item["content:encoded"]) || scalar(item.content) || scalar(item.description) || scalar(item.summary)).slice(0, 14000);
      return [{ title, url, text: text || title, publishedAt: parseDate(scalar(item.pubDate) || scalar(item.published) || scalar(item["dc:date"]) || scalar(item.updated)), language: detectLanguage(title + text, language), scope: "feed-excerpt" as const }];
    } catch { return []; }
  });
}
export function extractPage(html: string, url: string, language = "en"): CollectedItem {
  const meta = (key: string) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
      if (attrs.property === key || attrs.name === key) return decodeEntities(attrs.content ?? "");
    }
    return "";
  };
  const title = stripHtml(meta("og:title") || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Untitled article").slice(0, 500);
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const paragraphs = article ?? (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []).join(" ");
  const text = stripHtml(paragraphs || meta("description")).slice(0, 14000);
  if (text.length < 80) throw new InputError("Too little readable text. This page may require JavaScript or a subscription; paste an accessible excerpt instead.");
  if (/enable javascript|verify you are human|just a moment/i.test(title)) throw new InputError("The site requires browser verification. Automated access was stopped.");
  return { title, url: canonicalUrl(url), text, publishedAt: parseDate(meta("article:published_time") || meta("datePublished")), language: detectLanguage(text, language), scope: "article" };
}
export function robotsAllows(text: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; value: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; value: string }[] };
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.split("#")[0].trim().match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && value) group.rules.push({ allow: key === "allow", value });
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.some(a => a !== "*" && "companylens".includes(a)));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes("*"));
  const matches = applicable.flatMap(g => g.rules).filter(r => {
    const escaped = r.value.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try { return new RegExp("^" + escaped).test(path); } catch { return true; }
  }).sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}
async function allowedPage(url: string, fetcher: typeof fetch): Promise<void> {
  const u = publicUrl(url);
  try {
    const robots = await fetchPublic(new URL("/robots.txt", u).toString(), "text/plain", fetcher);
    if (!robotsAllows(robots.text, u.pathname + u.search)) throw new InputError("This source disallows Company Lens in robots.txt.");
  } catch (error) {
    if (!(error instanceof Error && /HTTP 404|HTTP 410/.test(error.message))) throw error;
  }
}
export function discoverFeeds(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  // Only publisher-advertised links; never guess private APIs or treat a homepage as an article.
  const clean = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of clean.match(/<(?:link|a)\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), decodeEntities(m[3])]));
    const href = attrs.href || "";
    const advertised = /application\/(rss|atom)\+xml/i.test(attrs.type || "") || /(?:rss|feeds?)(?:[/.?]|$)|\.xml(?:\?|$)/i.test(href);
    if (!advertised || /comments?/i.test(href + " " + (attrs.title || ""))) continue;
    try { candidates.push(publicUrl(new URL(href, baseUrl).toString()).toString()); } catch { /* Ignore unsafe advertised URLs. */ }
  }
  return [...new Set(candidates)].filter(url => url !== baseUrl).slice(0, 3);
}
export async function loadSource(source: Source, fetcher: typeof fetch = fetch): Promise<CollectedItem[]> {
  const feedAccept = "application/rss+xml, application/atom+xml, application/xml, text/xml";
  const loadFeed = async (url: string) => {
    await allowedPage(url, fetcher);
    const feed = await fetchPublic(url, feedAccept, fetcher, 4_000_000);
    return parseFeed(feed.text, feed.url, source.language);
  };
  if (source.kind === "rss") return loadFeed(source.url);
  await allowedPage(source.url, fetcher);
  const page = await fetchPublic(source.url, "text/html", fetcher);
  if (source.kind === "web") return [extractPage(page.text, page.url, source.language)];
  const candidates = discoverFeeds(page.text, page.url);
  if (!candidates.length) throw new InputError("No public RSS/Atom feed was advertised. Import an accessible article or newsletter excerpt manually; app-only access is not connected.");
  let lastError = "No readable feed";
  for (const url of candidates) {
    try { return await loadFeed(url); } catch (error) { lastError = error instanceof Error ? error.message : "Feed unavailable"; }
  }
  throw new InputError(`Advertised feeds could not be read. ${lastError}`);
}
