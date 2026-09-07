import type { Repository } from '../db/index.ts';
export interface Job<T = Record<string, unknown>> { id: string; kind: 'backfill' | 'document'; companyId: string; status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'paused' | 'waiting-key' | 'review'; data: T; error: string | null; createdAt: string; updatedAt: string }
export async function jobs<T>(repo: Repository, kind?: Job['kind']): Promise<Job<T>[]> {
  const result = await (kind ? repo.db.prepare('SELECT * FROM jobs WHERE kind=? ORDER BY updated_at DESC LIMIT 250').bind(kind) : repo.db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 250')).all<Record<string, string>>();
  return result.results.map(r => ({ id: r.id, kind: r.kind as Job['kind'], companyId: r.company_id, status: r.status as Job['status'], data: JSON.parse(r.data), error: r.error, createdAt: r.created_at, updatedAt: r.updated_at }));
}
export async function saveJob<T>(repo: Repository, job: Job<T>) {
  job.updatedAt = new Date().toISOString();
  await repo.db.prepare('INSERT INTO jobs (id,kind,company_id,status,data,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data,error=excluded.error,updated_at=excluded.updated_at')
    .bind(job.id, job.kind, job.companyId, job.status, JSON.stringify(job.data), job.error, job.createdAt, job.updatedAt).run();
}
export async function nextJob<T>(repo: Repository, kind: Job['kind']): Promise<Job<T> | undefined> {
  return (await jobs<T>(repo, kind)).filter(j => ['queued', 'running'].includes(j.status)).sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))[0];
}
