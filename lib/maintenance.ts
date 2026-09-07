import type { Repository } from '../db/index.ts';
import type { RuntimeEnv } from './runtime.ts';
import { aiStatus, modelEnvironment, reserveAiAttempt } from './ai-settings.ts';
import { syncCoverage, scheduleStatus } from './coverage-sync.ts';
import { backfillStep, type BackfillData } from './backfill.ts';
import { documentStep } from './documents.ts';
import { jobs, saveJob } from './jobs.ts';
import { analyze, embed } from './provider.ts';
import { initialSources, COLLECTION_INTERVAL_MS } from './catalog.ts';
import { ingestSource } from './pipeline.ts';

export function sourceIssue(error: string | null) {
  if (!error) return null;
  if (/robots/i.test(error)) return { category:'Publisher policy', action:'Automated access is disallowed. Use a permitted feed or an excerpt you can access.' };
  if (/403|401|verification|subscription/i.test(error)) return { category:'Access restricted', action:'Publisher access controls prevented collection. Import an accessible excerpt or use an approved API.' };
  if (/429/i.test(error)) return { category:'Rate limited', action:'Retry later; repeated checks may prolong the limit.' };
  if (/404|410|RSS|Atom|advertised|redirect/i.test(error)) return { category:'Feed unavailable', action:'Check the publisher’s current RSS directory or replace the source URL.' };
  if (/timeout|timed out|aborted/i.test(error)) return { category:'Timeout', action:'A later scheduled run will retry this source.' };
  if (/DNS|hostname|resolve|public addresses/i.test(error)) return { category:'DNS verification', action:'The hostname could not be safely resolved. Verify the publisher URL.' };
  return { category:'Retrieval failed', action:'Inspect the source error and try a permitted feed or article URL.' };
}
export async function diagnostics(repo: Repository, env: RuntimeEnv) {
  const [counts,sources,schedule,raw,heartbeat,queue] = await Promise.all([
    repo.db.prepare("SELECT c.id,c.name,COUNT(a.id) AS stored,SUM(CASE WHEN json_extract(a.analysis,'$.mode')='model' THEN 1 ELSE 0 END) AS enriched,MIN(a.published_at) AS earliest,MAX(a.published_at) AS latest FROM companies c LEFT JOIN articles a ON a.company_id=c.id GROUP BY c.id ORDER BY c.name").all(),
    repo.sources(),scheduleStatus(repo,env),repo.getSetting('coverageStatus'),repo.getSetting('maintenanceStatus'),jobs<BackfillData>(repo,'backfill')]);
  const coverage=JSON.parse(raw || '{}');
  return { companies:counts.results, imported:counts.results.reduce((n,c)=>n+Number(c.stored),0), collected:coverage.collectedRecords ?? null, collectedAt:coverage.snapshotAt ?? null,
    pendingRecords:coverage.pendingRecords ?? null, pendingSnapshots:schedule.pending, failedSources:sources.filter(s=>s.enabled && s.status==='error').length,
    sources:sources.filter(s=>s.enabled && s.status==='error').map(s=>({id:s.id,name:s.name,error:s.error,...sourceIssue(s.error)})), schedule,
    maintenance:heartbeat ? JSON.parse(heartbeat) : null,
    backfill:queue.map(j=>({...j,data:{...j.data,pendingCandidates:j.data.candidates.length-j.data.offset,candidates:undefined}})),
    scope:'Collected is company-matched records in the snapshot being imported. Imported is all stored article-company records. Pending records refers to that snapshot; pending snapshots can contain more. Failed sources are separate from failed historical URLs.' };
}
export async function maintenance(repo: Repository, original: RuntimeEnv) {
  await repo.initialize();
  if (await repo.getSetting('autoRefresh') === 'false') return { pending:false, paused:true };
  if (!await repo.acquire('maintenance',180)) return { pending:true, busy:true };
  const result: Record<string,unknown> = { at:new Date().toISOString(), synced:0, enriched:0, pending:false, errors:[] };
  const errors = result.errors as string[];
  try {
    const env=await modelEnvironment(repo,original), prefs=await aiStatus(repo,env);
    const previous=JSON.parse(await repo.getSetting('maintenanceStatus') || '{}');
    const turn=(Number(previous.turn) || 0)+1; result.turn=turn;
    // Download encrypted snapshots once per invocation. Each import resumes its own cursor.
    if (env.COVERAGE_PRIVATE_KEY && (turn % 4 === 1 || !previous.at || Date.now()-Date.parse(previous.at)>120000)) {
      try { const sync=await syncCoverage(repo,env); result.synced=sync.inserted; result.pending=sync.pending>0; }
      catch (e) { errors.push(e instanceof Error ? e.message : 'Snapshot sync failed'); }
    }
    if (env.OPENAI_API_KEY) for (const job of (await jobs(repo,'document')).filter(j=>j.status==='waiting-key')) { job.status='queued'; await saveJob(repo,job); }
    const queue=await jobs(repo), documentDue=queue.some(j=>j.kind==='document' && ['queued','running'].includes(j.status));
    if (documentDue && turn%2===0) result.document=await documentStep(repo,env);
    else result.backfill=await backfillStep(repo);
    // Custom publishers are private and are not part of the public GitHub collector.
    if (turn%4===0) {
      const due=(await repo.sources()).find(s=>s.enabled && !initialSources.some(i=>i.id===s.id && i.url===s.url) && (!s.lastFetchedAt || Date.now()-Date.parse(s.lastFetchedAt)>=COLLECTION_INTERVAL_MS));
      if (due) result.custom=await ingestSource(repo,{},due.id);
    }
    if (env.OPENAI_API_KEY && prefs.autoEnrich) {
      const failed: Record<string,number> = JSON.parse(await repo.getSetting('aiFailures') || '{}');
      const candidate=(await repo.db.prepare("SELECT id,company_id FROM articles WHERE demo=0 AND (json_extract(analysis,'$.mode')<>'model' OR embedding IS NULL) ORDER BY fetched_at DESC LIMIT 500").all<{id:string;company_id:string}>()).results.find(a=>(failed[a.id] || 0)<3);
      if (candidate && await reserveAiAttempt(repo,prefs.dailyLimit)) {
        try {
          const company=(await repo.companies()).find(c=>c.id===candidate.company_id)!, article=(await repo.articles(company.id)).find(a=>a.id===candidate.id)!;
          if (article.analysis.mode !== 'model') article.analysis=await analyze(env,article.title,article.text,company.name);
          if (!article.embedding) { article.embedding=await embed(env,article.title+'\n'+article.text); article.embeddingModel=env.EMBEDDING_MODEL || 'text-embedding-3-small'; }
          await repo.updateAnalysis(article); result.enriched=1; delete failed[article.id]; result.pending=true;
        } catch (e) { failed[candidate.id]=(failed[candidate.id] || 0)+1; errors.push(e instanceof Error ? e.message : 'AI enrichment failed'); }
        await repo.setSetting('aiFailures',JSON.stringify(failed));
      }
    }
    result.pending=!!result.pending || (await jobs(repo)).some(j=>['queued','running'].includes(j.status));
    if (result.document && (result.document as {status:string}).status==='daily-limit' && !(await jobs(repo,'backfill')).some(j=>['queued','running'].includes(j.status))) result.pending=false;
    // A partially imported snapshot still needs draining even between download turns.
    result.pending=!!result.pending || (await scheduleStatus(repo,env)).pending>0;
    await repo.setSetting('maintenanceStatus',JSON.stringify(result)); return result;
  } catch (e) { errors.push(e instanceof Error ? e.message : 'Maintenance failed'); await repo.setSetting('maintenanceStatus',JSON.stringify(result)); throw e; }
  finally { await repo.release('maintenance'); }
}
