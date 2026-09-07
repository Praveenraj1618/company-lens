import { Repository } from '../db/index.ts';
import { initialCompanies, initialSources, COLLECTION_INTERVAL_MS } from './catalog.ts';
import { matchesCompany } from './intelligence.ts';
import { makeArticle } from './pipeline.ts';
import { manifestSchema, openSnapshot } from './scheduled-coverage.ts';
import { publicUrl, readLimited, InputError } from './safety.ts';
import type { RuntimeEnv } from './runtime.ts';
import type { Article, CollectionSchedule, Run } from './types.ts';

const SYNC_BATCH = 40;
const repositoryPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
function baseUrl(env: RuntimeEnv): string {
  if (!env.COVERAGE_REPOSITORY || !repositoryPattern.test(env.COVERAGE_REPOSITORY)) throw new InputError('Scheduled coverage is not configured.');
  return `https://raw.githubusercontent.com/${env.COVERAGE_REPOSITORY}/coverage-data/`;
}
async function download(url: string, max: number, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'user-agent': 'CompanyLens/2.0' } });
  if (response.status === 404) throw new InputError('Waiting for the first scheduled collection to finish.');
  if (!response.ok) throw new InputError(`Scheduled coverage download returned HTTP ${response.status}.`);
  return readLimited(response, max);
}
export async function scheduleStatus(repo: Repository, env: RuntimeEnv): Promise<CollectionSchedule> {
  const [raw, enabled, lastScheduledAt] = await Promise.all([repo.getSetting('coverageStatus'), repo.getSetting('autoRefresh'), repo.getSetting('lastScheduledAt')]);
  const saved = raw ? JSON.parse(raw) as Partial<CollectionSchedule> : {};
  const mode = env.COVERAGE_PRIVATE_KEY && env.COVERAGE_REPOSITORY ? 'github' : env.SCHEDULE_ENABLED === 'true' ? 'server' : 'browser';
  const lastRunAt = mode === 'github' ? saved.lastRunAt ?? null : lastScheduledAt;
  const status = enabled === 'false' ? 'paused' : saved.error ? 'error' : !lastRunAt ? 'waiting' : Date.now() - Date.parse(lastRunAt) > COLLECTION_INTERVAL_MS * 2 ? 'delayed' : 'current';
  return { mode, intervalHours: 3, status, lastRunAt, lastSyncedAt: saved.lastSyncedAt ?? null, nextRunAt: lastRunAt ? new Date(Date.parse(lastRunAt) + COLLECTION_INTERVAL_MS).toISOString() : null, healthy: saved.healthy ?? 0, failed: saved.failed ?? 0, pending: saved.pending ?? 0, error: saved.error ?? null };
}
export async function syncCoverage(repo: Repository, env: RuntimeEnv, fetcher: typeof fetch = fetch): Promise<{ inserted: number; pending: number; paused?: boolean }> {
  await repo.initialize();
  if (await repo.getSetting('autoRefresh') === 'false') return { inserted: 0, pending: 0, paused: true };
  if (!env.COVERAGE_PRIVATE_KEY) throw new InputError('Scheduled coverage is not configured.');
  if (!await repo.acquire('coverage-sync', 180)) throw new InputError('Scheduled coverage is already syncing.');
  try {
    const base = baseUrl(env);
    const manifest = manifestSchema.parse(JSON.parse(await download(base + 'manifest.json', 30000, fetcher)));
    const status = await scheduleStatus(repo, env);
    const cursorText = await repo.getSetting('coverageCursor');
    let cursor: { id: string; offset: number; stats: Record<string, { inserted: number; duplicates: number }> } = cursorText ? JSON.parse(cursorText) : { id: '', offset: 0, stats: {} };
    const completed = await repo.getSetting('coverageCompleted') ?? '';
    const queue = manifest.snapshots.filter(s => s.id > completed).sort((a, b) => a.id.localeCompare(b.id));
    if (!queue.length) {
      await repo.setSetting('coverageStatus', JSON.stringify({ ...status, pending: 0, error: null }));
      return { inserted: 0, pending: 0 };
    }
    const target = queue[0];
    if (cursor.id !== target.id) cursor = { id: target.id, offset: 0, stats: {} };
    const sealed = await download(base + `snapshots/${target.id}.json`, 8_001_000, fetcher);
    // Hash checks exact bytes; fingerprint() intentionally normalizes text and is not used here.
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sealed)))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== target.sha256) throw new InputError('The scheduled snapshot failed its integrity check.');
    const snapshot = await openSnapshot(sealed, JSON.parse(env.COVERAGE_PRIVATE_KEY));
    if (snapshot.id !== target.id || snapshot.finishedAt !== target.finishedAt) throw new InputError('The scheduled snapshot does not match its manifest.');
    if (Date.parse(snapshot.finishedAt) > Date.now() + 60000) throw new InputError('The scheduled snapshot has an invalid future timestamp.');
    const [companies, sources] = await Promise.all([repo.companies(), repo.sources()]);
    const sourceMap = new Map(sources.map(s => [s.id, s])); const cache = new Map<string, Article[]>(); let inserted = 0;
    for (const entry of snapshot.items.slice(cursor.offset, cursor.offset + SYNC_BATCH)) {
      const source = sourceMap.get(entry.sourceId), company = companies.find(c => c.id === entry.companyId);
      // Only known public catalog records enter this path; private custom entries stay private.
      if (!source?.enabled || !company || !initialSources.some(s => s.id === source.id && s.url === source.url) || !initialCompanies.some(c => c.id === company.id)) continue;
      publicUrl(entry.item.url);
      if (!matchesCompany(entry.item.title + '\n' + entry.item.text, company)) continue;
      const stats = cursor.stats[source.id] ??= { inserted: 0, duplicates: 0 };
      if (await repo.exists(company.id, entry.item.url)) { stats.duplicates++; continue; }
      if (!cache.has(company.id)) cache.set(company.id, await repo.articles(company.id));
      // Collection is free of paid model calls; use Enrich for opt-in semantic analysis later.
      const { article } = await makeArticle({}, entry.item, source, company, cache.get(company.id)!);
      article.fetchedAt = snapshot.finishedAt;
      if (await repo.insertArticle(article)) { inserted++; stats.inserted++; cache.get(company.id)!.push(article); }
      else stats.duplicates++;
    }
    cursor.offset = Math.min(snapshot.items.length, cursor.offset + SYNC_BATCH);
    const done = cursor.offset >= snapshot.items.length;
    if (done) {
      const statements = [];
      for (const result of snapshot.sources) {
        if (!sourceMap.get(result.id)?.enabled) continue;
        statements.push(repo.db.prepare('UPDATE sources SET last_fetched_at=?,status=?,error=? WHERE id=? AND (last_fetched_at IS NULL OR last_fetched_at<=?)').bind(snapshot.finishedAt, result.status, result.error, result.id, snapshot.finishedAt));
        const counts = cursor.stats[result.id] ?? { inserted: 0, duplicates: 0 };
        const run: Run = { id: `scheduled:${snapshot.id}:${result.id}`, companyId: null, sourceId: result.id, startedAt: snapshot.startedAt, finishedAt: snapshot.finishedAt, status: result.status === 'error' ? 'error' : snapshot.truncated ? 'partial' : 'success', scanned: result.scanned, matched: result.matched, inserted: counts.inserted, duplicates: counts.duplicates, error: result.error ?? (snapshot.truncated ? 'Snapshot size limit reached; some matching items were omitted.' : null) };
        await repo.saveRun(run);
      }
      for (let i = 0; i < statements.length; i += 40) await repo.db.batch(statements.slice(i, i + 40));
      await repo.setSetting('coverageCompleted', snapshot.id);
      await repo.setSetting('lastScheduledAt', snapshot.finishedAt);
    }
    const pending = queue.length - (done ? 1 : 0);
    await repo.setSetting('coverageCursor', JSON.stringify(cursor));
    await repo.setSetting('coverageStatus', JSON.stringify({ ...status, lastRunAt: done ? snapshot.finishedAt : status.lastRunAt, lastSyncedAt: new Date().toISOString(), healthy: snapshot.sources.filter(s => s.status === 'healthy').length, failed: snapshot.sources.filter(s => s.status === 'error').length, pending, error: null }));
    return { inserted, pending };
  } catch (error) {
    const status = await scheduleStatus(repo, env);
    await repo.setSetting('coverageStatus', JSON.stringify({ ...status, error: error instanceof Error ? error.message : 'Scheduled sync failed.' }));
    throw error;
  } finally { await repo.release('coverage-sync'); }
}
