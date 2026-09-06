import type { Analysis, Article, Company, Sentiment } from "./types.ts";

const STOP = new Set("a an the and or but of to in on for from with by as at is are was were be been this that it its their they has have had will would can could about what how why when which who company said says news report reported latest please tell me does did us".split(" "));
export function normalize(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
}
export function tokens(text: string): string[] {
  return (normalize(text).match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter(t => t.length > 1 && !STOP.has(t));
}
export function detectLanguage(text: string, fallback = "en"): string {
  if (/[\u0B80-\u0BFF]/u.test(text)) return "ta";
  if (/[\u0900-\u097F]/u.test(text)) return "hi";
  return fallback;
}
export function matchesCompany(text: string, company: Pick<Company, "name" | "aliases">): boolean {
  const haystack = normalize(text);
  return [company.name, ...company.aliases].some(alias => {
    const needle = normalize(alias);
    if (needle.length < 2) return false;
    // Unicode boundaries prevent e.g. "TCS" matching "ATCSoftware".
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}])`, "u").test(haystack);
  });
}
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  if (u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}
export async function fingerprint(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalize(text)));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
}
export function similarity(a: string, b: string): number {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  const common = [...x].filter(t => y.has(t)).length;
  return common / Math.max(1, x.size + y.size - common);
}
export function clusterFor(candidate: Pick<Article, "id" | "title" | "text" | "publishedAt" | "contentHash" | "companyId">, articles: Article[]): string {
  const match = articles.find(a => {
    if (a.companyId !== candidate.companyId) return false;
    if (a.contentHash === candidate.contentHash) return true;
    if (!candidate.publishedAt || !a.publishedAt) return false;
    if (Math.abs(Date.parse(a.publishedAt) - Date.parse(candidate.publishedAt)) > 3 * 86400000) return false;
    return similarity(a.title, candidate.title) >= .72 && similarity(a.text, candidate.text) >= .45;
  });
  return match?.clusterId ?? candidate.id;
}

const EVENTS: [string, RegExp][] = [
  ["Workforce", /\b(layoffs?|job cuts?|hiring|employees?|workforce)\b|பணிநீக்கம்|வேலைவாய்ப்பு|ஊழியர்/iu],
  ["Regulatory", /\b(regulator|investigation|lawsuit|court|penalty|fined|probe)\b|விசாரணை|அபராதம்/iu],
  ["Financial results", /\b(profit|revenue|earnings|quarterly|losses)\b|லாபம்|வருவாய்|நஷ்டம்/iu],
  ["Funding & deals", /\b(funding|acquisition|acquires|merger|investment|raises)\b|முதலீடு/iu],
  ["Product & expansion", /\b(launch|launches|expansion|opens|product|facility|factory)\b|அறிமுகம்|விரிவாக்கம்|தொழிற்சாலை/iu],
  ["Partnership", /\b(partner|partnership|agreement|collaborat\w+)\b|ஒப்பந்தம்|கூட்டணி/iu],
  ["Leadership", /\b(ceo|appoints|resigns|leadership|chairman)\b|நியமனம்/iu],
];
export function baselineAnalysis(title: string, text: string): Analysis {
  const full = `${title}\n${text}`;
  const sentence = text.split(/(?<=[.!?।])\s+/u).find(s => s.trim().length > 35)?.trim() ?? text.trim();
  const positive = /\b(record profit|profit rises|profit grows|revenue grows|revenue rises|wins contract|raises funding)\b|லாபம் உயர்வு/iu.test(full);
  const negative = /\b(layoffs?|job cuts?|recall|fined|data breach|profit falls|revenue falls|loss widens)\b|பணிநீக்கம்|அபராதம்|நஷ்டம்/iu.test(full);
  const negated = /\b(no|not|denies|denied|avoids|avoided|without)\b.{0,35}\b(layoffs?|job cuts?|recall|fined|data breach|loss)\b/iu.test(full);
  const sentiment: Sentiment = negated ? "unclear" : positive && negative ? "mixed" : positive ? "positive" : negative ? "negative" : "unclear";
  return {
    eventType: EVENTS.find(([, pattern]) => pattern.test(full))?.[0] ?? "Company update",
    sentiment,
    summary: sentence.slice(0, 420) || title,
    facts: [{ claim: "Passage from the source; independently unverified.", quote: (sentence || title).slice(0, 420) }],
    impacts: [],
    uncertainty: "Keyword baseline only. Tone is provisional; stakeholder impacts and factual verification require review. Available text may be an excerpt.",
    mode: "baseline", model: null, translatedTitle: null, translatedText: null,
  };
}

export function bm25(query: string, docs: { id: string; text: string }[]): { id: string; score: number }[] {
  const terms = [...new Set(tokens(query))];
  const corpus = docs.map(d => tokens(d.text));
  const average = corpus.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
  return docs.map((doc, i) => {
    const score = terms.reduce((sum, term) => {
      const tf = corpus[i].filter(t => t === term).length;
      const df = corpus.filter(d => d.includes(term)).length;
      const idf = Math.log(1 + (docs.length - df + .5) / (df + .5));
      return sum + idf * (tf * 2.5) / (tf + 1.5 * (.25 + .75 * corpus[i].length / Math.max(average, 1)));
    }, 0);
    return { id: doc.id, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score);
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return dot / (Math.sqrt(x * y) || 1);
}
export function reciprocalRankFusion(rankings: { id: string; score: number }[][], k = 60) {
  const scores = new Map<string, number>();
  for (const ranking of rankings) ranking.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + i + 1)));
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}
export function evidenceSupported(quote: string, original: string): boolean {
  return quote.trim().length >= 12 && normalize(original).includes(normalize(quote));
}
export function selectEvidence(query: string, articles: Article[], limit = 5): Article[] {
  const ranked = bm25(query, articles.map(a => ({ id: a.id, text: `${a.title} ${a.text} ${a.analysis.translatedText ?? ""}` })));
  const clusters = new Set<string>();
  return ranked.map(r => articles.find(a => a.id === r.id)!).filter(a => {
    if (clusters.has(a.clusterId)) return false;
    clusters.add(a.clusterId); return true;
  }).slice(0, limit);
}
