import { z } from 'zod';
import type { Repository } from '../db/index.ts';
import type { Source } from './types.ts';
import { jobs, saveJob, type Job } from './jobs.ts';
import { InputError, publicUrl, readLimited } from './safety.ts';
import { canonicalUrl, matchesCompany } from './intelligence.ts';
import { loadSource, type CollectedItem } from './sources.ts';
import { makeArticle } from './pipeline.ts';

export interface BackfillData {
  from: string; to: string; cursor: string; windows: number; totalWindows: number;
  candidates: { url: string; sourceId: string }[]; offset: number;
  collected: number; imported: number; duplicates: number; failed: number; unknownDate: number; outsideRange: number; unmatched: number;
  gaps: string[];
  retryWindows?: string[]; recoveredRateLimits?: boolean;
}
const day = 86400000;
export function validateRange(from: string, to: string, now = Date.now()) {
  if (![from,to].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d)) throw new InputError('Choose valid calendar dates.');
  if (from > to || to > new Date(now).toISOString().slice(0,10) || now-Date.parse(from) > 90*day) throw new InputError('Choose a range within the past 90 days, ending no later than today.');
}
export async function createBackfill(repo: Repository, input: unknown) {
  const data = z.object({ companyIds: z.array(z.string()).min(1).max(75), from: z.string(), to: z.string() }).parse(input);
  validateRange(data.from, data.to);
  const companies = await repo.companies(), existing = await jobs<BackfillData>(repo, 'backfill');
  if (data.companyIds.some(id => !companies.some(c => c.id === id))) throw new InputError('Choose monitored companies.');
  if (existing.filter(j => ['queued','running','paused'].includes(j.status)).length + new Set(data.companyIds).size > 100) throw new InputError('Finish or pause existing work before adding more than 100 active historical jobs.');
  const created: string[] = [];
  for (const companyId of new Set(data.companyIds)) {
    const duplicate = existing.find(j => j.companyId === companyId && j.data.from === data.from && j.data.to === data.to && !['failed','partial'].includes(j.status));
    if (duplicate) { created.push(duplicate.id); continue; }
    const now = new Date().toISOString();
    const job: Job<BackfillData> = { id: crypto.randomUUID(), kind: 'backfill', companyId, status: 'queued', error: null, createdAt: now, updatedAt: now,
      data: { from: data.from, to: data.to, cursor: data.from, windows: 0, totalWindows: Math.ceil((Date.parse(data.to)-Date.parse(data.from)+day)/(7*day)), candidates: [], offset: 0, collected: 0, imported: 0, duplicates: 0, failed: 0, unknownDate: 0, outsideRange: 0, unmatched: 0, gaps: [] } };
    await saveJob(repo, job); created.push(job.id);
  }
  return { created };
}
export async function importHistoricalUrls(repo: Repository, input: unknown) {
  const data=z.object({jobId:z.string(),urls:z.array(z.string().url().max(2000)).min(1).max(100)}).parse(input);
  const job=(await jobs<BackfillData>(repo,'backfill')).find(j=>j.id===data.jobId);
  if (!job) throw new InputError('Historical job was not found.');
  const sources=await repo.sources();
  const candidates=data.urls.map(url=>{const source=monitoredSource(url,sources);if(!source)throw new InputError('Every URL must belong to an enabled monitored publisher.');return {url:canonicalUrl(url),sourceId:source.id}});
  const existing=new Set(job.data.candidates.map(c=>c.url));
  const added=candidates.filter(c=>!existing.has(c.url)&&!!existing.add(c.url));
  if (job.data.candidates.length+added.length>1000) throw new InputError('This job already has 1,000 article candidates.');
  job.data.candidates.push(...added); job.data.collected+=added.length; job.status='queued'; await saveJob(repo,job); return {queued:added.length};
}
export function monitoredSource(url: string, sources: Source[]): Source | undefined {
  const host = publicUrl(url).hostname.replace(/^www\./,'');
  return sources.find(s => {
    const sourceHost = new URL(s.url).hostname.replace(/^(www|feeds?|rss)\./,'');
    return s.enabled && (host === sourceHost || host.endsWith('.'+sourceHost) || (sourceHost === 'bbci.co.uk' && /(^|\.)bbc\.(com|co.uk)$/.test(host)));
  });
}
export function eligibleHistorical(item: CollectedItem, data: Pick<BackfillData,'from'|'to'>): 'eligible'|'unknownDate'|'outsideRange' {
  if (!item.publishedAt) return 'unknownDate';
  const date = item.publishedAt.slice(0,10);
  return date < data.from || date > data.to ? 'outsideRange' : 'eligible';
}
export async function backfillStep(repo: Repository, fetcher: typeof fetch = fetch, loader = loadSource) {
  const active = (await jobs<BackfillData>(repo, 'backfill')).filter(j=>['queued','running'].includes(j.status)).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  // Process already discovered pages while the search provider is cooling down.
  const job = active.find(j=>j.data.offset<j.data.candidates.length) || active[0]; if (!job) return null;
  const retryAt = await repo.getSetting('historicalRetryAt');
  if (job.data.offset>=job.data.candidates.length && retryAt && Date.parse(retryAt)>Date.now()) return {status:'deferred',retryAt};
  const company = (await repo.companies()).find(c => c.id === job.companyId)!;
  const sources = await repo.sources(), d = job.data;
  // Recover date windows skipped by the earlier importer after an HTTP 429.
  if (!d.recoveredRateLimits) {
    d.retryWindows=[...new Set(d.gaps.filter(g=>/Historical index returned HTTP 429/.test(g)).map(g=>g.slice(0,10)).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)))];
    d.recoveredRateLimits=true;
  }
  const gap = (message: string) => { if (d.gaps.length < 40) d.gaps.push(message.slice(0,700)); };
  job.status = 'running';
  try {
    if (d.offset < d.candidates.length) {
      const candidate = d.candidates[d.offset], source = sources.find(s => s.id === candidate.sourceId && s.enabled);
      try {
        if (!source) throw new InputError('Publisher is paused or no longer monitored.');
        if (await repo.exists(company.id, canonicalUrl(candidate.url))) d.duplicates++;
        else {
          const item = (await loader({ ...source, kind: 'web', url: candidate.url }, fetcher))[0];
          const eligibility = eligibleHistorical(item, d);
          if (eligibility !== 'eligible') { d[eligibility]++; gap(`${candidate.url}: ${eligibility === 'unknownDate' ? 'No reliable publication date' : 'Publication date outside the requested range'}`); }
          else if (!matchesCompany(item.title+'\n'+item.text, company)) d.unmatched++;
          else {
            const { article } = await makeArticle({}, item, source, company, await repo.articles(company.id));
            if (await repo.insertArticle(article)) d.imported++; else d.duplicates++;
          }
        }
      } catch (error) { d.failed++; gap(`${candidate.url}: ${error instanceof Error ? error.message : 'Article could not be read'}`); }
      d.offset++;
    } else if (d.cursor <= d.to || d.retryWindows?.length) {
      const recovering=d.cursor>d.to;
      const start = recovering ? d.retryWindows![0] : d.cursor, end = new Date(Math.min(Date.parse(start)+6*day,Date.parse(d.to))).toISOString().slice(0,10);
      const names = [...new Set([company.name,...company.aliases].filter(n => /^[\w .&-]+$/.test(n) && n.length >= 3))].slice(0,4);
      const query = names.length > 1 ? '('+names.map(n => '"'+n.replace(/"/g,'')+'"').join(' OR ')+')' : '"'+names[0]+'"';
      const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
      url.search = new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: '250', sort: 'datedesc', startdatetime: start.replaceAll('-','')+'000000', enddatetime: end.replaceAll('-','')+'235959' }).toString();
      try {
        const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
        if (response.status===429) {
          const header=response.headers.get('retry-after');
          const requested=header && /^\d+$/.test(header) ? Date.now()+Number(header)*1000 : Date.parse(header || '');
          const retryAt=new Date(Math.min(Date.now()+day,Math.max(Date.now()+900000,Number.isFinite(requested)?requested:0))).toISOString();
          await response.body?.cancel(); await repo.setSetting('historicalRetryAt',retryAt);
          job.error=`Historical search is rate limited. This date window remains queued; retry after ${retryAt}.`;
          await saveJob(repo,job); return {id:job.id,status:'deferred',retryAt};
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Historical index returned HTTP ${response.status}`); }
        const result = z.object({ articles: z.array(z.object({ url: z.string().max(2000) })).max(250).optional() }).parse(JSON.parse(await readLimited(response,2_000_000)));
        d.candidates = [...new Map((result.articles || []).flatMap(a => { try { const source = monitoredSource(a.url,sources); return source ? [[canonicalUrl(a.url), { url: canonicalUrl(a.url), sourceId: source.id }] as const] : []; } catch { return []; } })).values()];
        d.offset = 0; d.collected += d.candidates.length;
        if ((result.articles?.length || 0) >= 250) gap(`${start}–${end}: index result cap reached; coverage is incomplete.`);
        if (!d.candidates.length) gap(`${start}–${end}: no indexed matches from enabled publishers. This does not prove no reporting exists.`);
        if (recovering) d.gaps=d.gaps.filter(g=>!(g.startsWith(start) && /Historical index returned HTTP 429/.test(g)));
      } catch (error) { d.failed++; gap(`${start}–${end}: ${error instanceof Error ? error.message : 'Index unavailable'}`); d.candidates=[]; d.offset=0; }
      if (recovering) d.retryWindows!.shift();
      else { d.windows++; d.cursor = new Date(Date.parse(end)+day).toISOString().slice(0,10); }
    }
    if (d.cursor > d.to && d.offset >= d.candidates.length && !d.retryWindows?.length) job.status = d.gaps.length ? 'partial' : 'completed';
    job.error = null;
  } catch (error) { job.status = 'failed'; job.error = error instanceof Error ? error.message : 'Historical job failed'; }
  await saveJob(repo,job);
  return { id: job.id, companyId: job.companyId, status: job.status, imported: d.imported };
}
