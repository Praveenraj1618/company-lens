import { COLLECTION_INTERVAL_MS } from "./catalog.ts";
import { Repository } from "../db/index.ts";
import { baselineAnalysis, canonicalUrl, clusterFor, fingerprint, matchesCompany } from "./intelligence.ts";
import { analyze, embed } from "./provider.ts";
import type { ModelConfig } from "./provider.ts";
import { loadSource } from "./sources.ts";
import type { CollectedItem } from "./sources.ts";
import type { Article, Company, Run, Source } from "./types.ts";
import { InputError } from "./safety.ts";

export const MAX_NEW_ARTICLES_PER_RUN = 8;
export async function makeArticle(config: ModelConfig, item: CollectedItem, source: Source, company: Company, existing: Article[], manual = false): Promise<{ article: Article; warning: string | null }> {
  let analysis = baselineAnalysis(item.title, item.text), embedding: number[] | null = null, warning: string | null = null;
  if (config.OPENAI_API_KEY) {
    try { analysis = await analyze(config, item.title, item.text, company.name); }
    catch (error) { warning = error instanceof Error ? error.message : "AI analysis failed."; }
    try { embedding = await embed(config, `${item.title}\n${item.text}`); }
    catch { warning = [warning, "Embedding generation failed; lexical retrieval remains available."].filter(Boolean).join(" "); }
  }
  const article: Article = {
    id: crypto.randomUUID(), companyId: company.id, sourceId: source.id, sourceName: source.name,
    title: item.title, url: canonicalUrl(item.url), text: item.text, publishedAt: item.publishedAt,
    fetchedAt: new Date().toISOString(), language: item.language, region: source.region,
    contentHash: await fingerprint(item.text), clusterId: "", analysis, embedding,
    embeddingModel: embedding ? config.EMBEDDING_MODEL || "text-embedding-3-small" : null,
    contentScope: manual ? "manual" : item.scope, demo: false,
  };
  article.clusterId = clusterFor(article, existing);
  return { article, warning };
}
export async function ingestSource(repo: Repository, config: ModelConfig, sourceId: string, loader = loadSource): Promise<Run> {
  const source = (await repo.sources()).find(s => s.id === sourceId);
  if (!source || !source.enabled) throw new InputError("Choose an enabled source.");
  if (!await repo.acquire(`source:${sourceId}`, 600)) throw new InputError("This source is already being collected. Try again after the current run finishes.");
  const run: Run = { id: crypto.randomUUID(), companyId: null, sourceId, startedAt: new Date().toISOString(), finishedAt: null, status: "running", scanned: 0, matched: 0, inserted: 0, duplicates: 0, error: null };
  try {
    await repo.saveRun(run);
    const items = await loader(source), companies = (await repo.companies()).filter(c => !c.demo);
    const cache = new Map<string, Article[]>(); const warnings = new Set<string>();
    run.scanned = items.length;
    for (const item of items) {
      const matches = companies.filter(c => matchesCompany(`${item.title}\n${item.text}`, c));
      if (matches.length) run.matched++;
      for (const company of matches) {
        if (await repo.exists(company.id, canonicalUrl(item.url))) { run.duplicates++; continue; }
        if (run.inserted >= (config.OPENAI_API_KEY ? MAX_NEW_ARTICLES_PER_RUN : 80)) { warnings.add("Run limit reached; remaining items can be collected in a later run."); continue; }
        if (!cache.has(company.id)) cache.set(company.id, await repo.articles(company.id));
        const { article, warning } = await makeArticle(config, item, source, company, cache.get(company.id)!);
        if (warning) warnings.add(warning);
        if (await repo.insertArticle(article)) { run.inserted++; cache.get(company.id)!.push(article); }
        else run.duplicates++;
      }
    }
    run.status = warnings.size ? "partial" : "success";
    run.error = [...warnings].join(" ").slice(0, 1200) || null;
    await repo.sourceResult(sourceId, "healthy", null);
  } catch (error) {
    run.status = "error"; run.error = error instanceof Error ? error.message.slice(0, 1000) : "Collection failed.";
    await repo.sourceResult(sourceId, "error", run.error);
  } finally {
    run.finishedAt = new Date().toISOString();
    await repo.saveRun(run);
    await repo.release(`source:${sourceId}`);
  }
  return run;
}
// A small browser tick; standalone cycles drain every due source with bounded concurrency.
export async function scheduledTick(repo: Repository, config: ModelConfig, loader = loadSource): Promise<Run | null> {
  await repo.initialize();
  if (await repo.getSetting("autoRefresh") === "false") return null;
  const due = (await repo.sources()).filter(s => s.enabled && (!s.lastFetchedAt || Date.now() - Date.parse(s.lastFetchedAt) >= COLLECTION_INTERVAL_MS))
    .sort((a, b) => (a.lastFetchedAt ?? "").localeCompare(b.lastFetchedAt ?? ""));
  if (!due.length) return null;
  const run = await ingestSource(repo, config, due[0].id, loader);
  await repo.setSetting("lastScheduledAt", new Date().toISOString());
  return run;
}
export async function scheduledCycle(repo: Repository, config: ModelConfig, loader = loadSource): Promise<Run[]> {
  await repo.initialize();
  if (await repo.getSetting("autoRefresh") === "false" || !await repo.acquire("scheduled-cycle", 1800)) return [];
  try {
    const due = (await repo.sources()).filter(s => s.enabled && (!s.lastFetchedAt || Date.now() - Date.parse(s.lastFetchedAt) >= COLLECTION_INTERVAL_MS));
    let cursor = 0; const runs: Run[] = []; const hosts = new Map<string, Promise<void>>();
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < due.length) {
        const source = due[cursor++], host = new URL(source.url).hostname, before = hosts.get(host) ?? Promise.resolve();
        let release!: () => void; hosts.set(host, new Promise<void>(resolve => { release = resolve; })); await before;
        try { runs.push(await ingestSource(repo, config, source.id, loader)); } catch (error) { console.error("Scheduled source failed", source.id, error instanceof Error ? error.message : "Unknown error"); } finally { release(); }
      }
    }));
    if (runs.length) await repo.setSetting("lastScheduledAt", new Date().toISOString());
    return runs;
  } finally { await repo.release("scheduled-cycle"); }
}
