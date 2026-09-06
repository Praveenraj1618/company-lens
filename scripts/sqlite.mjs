import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/** Implements the small D1 contract used by the app against native Node SQLite. */
export function openDatabase(filename, migrations = resolve('drizzle')) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS __lens_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL)');
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(migrations,name),'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const existing = sqlite.prepare('SELECT hash FROM __lens_migrations WHERE name=?').get(name);
    if (existing) { if (existing.hash !== hash) throw new Error(`Applied migration ${name} has changed. Restore it and add a new migration.`); continue; }
    sqlite.exec('BEGIN');
    try { sqlite.exec(sql); sqlite.prepare('INSERT INTO __lens_migrations (name,hash) VALUES (?,?)').run(name,hash); sqlite.exec('COMMIT'); }
    catch (e) { sqlite.exec('ROLLBACK'); sqlite.close(); throw e; }
  }
  const wrap = (sql, args=[]) => ({
    sql, args,
    bind(...values) { return wrap(sql,values); },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  });
  return {
    prepare: wrap,
    async batch(statements) {
      // No await inside the transaction: other HTTP requests cannot interleave.
      sqlite.exec('BEGIN');
      try {
        const results=statements.map(s=>({ meta: { changes:Number(sqlite.prepare(s.sql).run(...s.args).changes) } }));
        sqlite.exec('COMMIT'); return results;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
    close() { sqlite.close(); },
  };
}
