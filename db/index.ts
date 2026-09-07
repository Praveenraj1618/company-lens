import type { Database } from "../lib/runtime.ts";
import type { Article, Company, Run, Source } from "../lib/types.ts";
import { CATALOG_VERSION, initialCompanies, initialSources } from "../lib/catalog.ts";

type Row = Record<string, unknown>;
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
function decode<T>(row: Row): T {
  const data: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const k = camel(key);
    data[k] = ["aliases", "analysis", "embedding"].includes(k) && typeof value === "string" ? JSON.parse(value) : ["enabled", "demo"].includes(k) ? Boolean(value) : value;
  }
  return data as T;
}
export class Repository {
  db: Database;
  constructor(db: Database) { if (!db) throw new Error("Database is unavailable."); this.db = db; }
  async initialize(): Promise<void> {
    const ready = await this.getSetting("catalogVersion");
    if (ready === CATALOG_VERSION) return;
    const statements = initialCompanies.map(c => this.db.prepare("INSERT OR IGNORE INTO companies (id,name,domain,industry,aliases,description,demo,created_at) VALUES (?,?,?,?,?,?,0,?)").bind(c.id,c.name,c.domain,c.industry,JSON.stringify(c.aliases),c.description,c.createdAt));
    statements.push(...initialSources.map(s => this.db.prepare("INSERT OR IGNORE INTO sources (id,name,url,kind,region,language,enabled,status) VALUES (?,?,?,?,?,?,1,'unfetched')").bind(s.id,s.name,s.url,s.kind,s.region,s.language)));
    statements.push(this.db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('initialized','1')"));
    // Keep batches small for D1; retries resume safely without changing user edits.
    for (let i = 0; i < statements.length; i += 40) await this.db.batch(statements.slice(i, i + 40));
    await this.setSetting("catalogVersion", CATALOG_VERSION);
  }
  async companies(): Promise<Company[]> { return (await this.db.prepare("SELECT * FROM companies ORDER BY created_at,name").all()).results.map(r => decode<Company>(r)); }
  async sources(): Promise<Source[]> { return (await this.db.prepare("SELECT * FROM sources ORDER BY name").all()).results.map(r => decode<Source>(r)); }
  async articles(companyId: string): Promise<Article[]> {
    return (await this.db.prepare("SELECT * FROM articles WHERE company_id=? ORDER BY COALESCE(published_at,fetched_at) DESC LIMIT 1500").bind(companyId).all()).results.map(r => decode<Article>(r));
  }
  async runs(): Promise<Run[]> { return (await this.db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT 150").all()).results.map(r => decode<Run>(r)); }
  async putCompany(c: Company): Promise<void> {
    await this.db.prepare("INSERT INTO companies (id,name,domain,industry,aliases,description,demo,created_at) VALUES (?,?,?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,domain=excluded.domain,industry=excluded.industry,aliases=excluded.aliases,description=excluded.description").bind(c.id,c.name,c.domain,c.industry,JSON.stringify(c.aliases),c.description,c.createdAt).run();
  }
  async putSource(s: Source): Promise<void> {
    await this.db.prepare("INSERT INTO sources (id,name,url,kind,region,language,enabled,status) VALUES (?,?,?,?,?,?,?,?)").bind(s.id,s.name,s.url,s.kind,s.region,s.language,Number(s.enabled),s.status).run();
  }
  async toggleSource(id: string, enabled: boolean): Promise<void> { await this.db.prepare("UPDATE sources SET enabled=? WHERE id=?").bind(Number(enabled),id).run(); }
  async sourceResult(id: string, status: Source["status"], error: string | null): Promise<void> {
    await this.db.prepare("UPDATE sources SET last_fetched_at=?,status=?,error=? WHERE id=?").bind(new Date().toISOString(),status,error,id).run();
  }
  async exists(companyId: string, url: string): Promise<boolean> { return !!await this.db.prepare("SELECT id FROM articles WHERE company_id=? AND url=?").bind(companyId,url).first(); }
  async insertArticle(a: Article): Promise<boolean> {
    const result = await this.db.prepare("INSERT OR IGNORE INTO articles (id,company_id,source_id,source_name,title,url,text,published_at,fetched_at,language,region,content_hash,cluster_id,analysis,embedding,embedding_model,content_scope,demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(a.id,a.companyId,a.sourceId,a.sourceName,a.title,a.url,a.text,a.publishedAt,a.fetchedAt,a.language,a.region,a.contentHash,a.clusterId,JSON.stringify(a.analysis),a.embedding ? JSON.stringify(a.embedding) : null,a.embeddingModel,a.contentScope,Number(a.demo)).run();
    return result.meta.changes > 0;
  }
  async updateAnalysis(a: Article): Promise<void> {
    await this.db.prepare("UPDATE articles SET analysis=?,embedding=?,embedding_model=? WHERE id=?").bind(JSON.stringify(a.analysis),a.embedding ? JSON.stringify(a.embedding) : null,a.embeddingModel,a.id).run();
  }
  async saveRun(r: Run): Promise<void> {
    await this.db.prepare("INSERT INTO runs (id,company_id,source_id,started_at,finished_at,status,scanned,matched,inserted,duplicates,error) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET finished_at=excluded.finished_at,status=excluded.status,scanned=excluded.scanned,matched=excluded.matched,inserted=excluded.inserted,duplicates=excluded.duplicates,error=excluded.error")
      .bind(r.id,r.companyId,r.sourceId,r.startedAt,r.finishedAt,r.status,r.scanned,r.matched,r.inserted,r.duplicates,r.error).run();
  }
  async getSetting(key: string): Promise<string | null> { return (await this.db.prepare("SELECT value FROM settings WHERE key=?").bind(key).first<{ value: string }>())?.value ?? null; }
  async setSetting(key: string, value: string): Promise<void> { await this.db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value).run(); }
  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now()/1000);
    const result = await this.db.prepare("INSERT INTO leases (key,expires_at) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE leases.expires_at<=?").bind(key,now+ttlSeconds,now).run();
    return result.meta.changes > 0;
  }
  async release(key: string): Promise<void> { await this.db.prepare("DELETE FROM leases WHERE key=?").bind(key).run(); }
}
