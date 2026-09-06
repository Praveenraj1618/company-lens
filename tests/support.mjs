import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const wrap = (sql, args=[]) => ({
    bind(...values) { return wrap(sql,values); },
    async all() { return {results:sqlite.prepare(sql).all(...args)}; },
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async run() { return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}; },
  });
  return { prepare:wrap, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results=[]; for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results; }
    catch(e) { sqlite.exec('ROLLBACK');throw e; }
  }, close:()=>sqlite.close() };
}
