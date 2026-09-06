import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../scripts/server.mjs';
import { openDatabase } from '../scripts/sqlite.mjs';
import { Repository } from '../db/index.ts';
import { scheduledTick } from '../lib/pipeline.ts';

test('standalone HTTP serves the built app, assets, persisted API, and protected writes',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lens-runtime-'));
  const runtime=await createRuntime({database:join(directory,'data.sqlite'),env:{ALLOW_LOCAL_DEV:'true',SCHEDULE_ENABLED:'false'}});
  await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+runtime.server.address().port;
  try {
    const page=await fetch(base);const html=await page.text();assert.equal(page.status,200);assert.match(html,/Intelligence overview/);
    const assets=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>m[1]).filter(p=>p.startsWith('/'));
    assert.ok(assets.length>0);for(const path of assets.slice(0,8)){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.ok((await r.arrayBuffer()).byteLength>0);}
    const state=await (await fetch(base+'/api/state?company=infosys')).json();assert.equal(state.companies.length,6);
    const body={name:'Runtime Test Company',domain:'runtime-example.com',industry:'Testing',aliases:['Runtime Example']};
    const saved=await fetch(base+'/api/companies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(saved.status,201);
    const changed=await (await fetch(base+'/api/state?company=infosys')).json();assert.equal(changed.companies.length,7);
    const csrf=await fetch(base+'/api/companies',{method:'POST',headers:{'content-type':'application/json',origin:'https://untrusted.example'},body:JSON.stringify(body)});assert.equal(csrf.status,400);
    const health=await fetch(base+'/api/health');assert.equal(health.status,200);
  }finally{await runtime.close();}
  const db=openDatabase(join(directory,'data.sqlite'));assert.equal((await new Repository(db).companies()).length,6);db.close();rmSync(directory,{recursive:true,force:true});
});
test('standalone password protection ignores spoofed Sites headers',async()=>{
  const runtime=await createRuntime({database:':memory:',env:{DASHBOARD_PASSWORD:'correct-test-password',TRUST_SITES_AUTH:'true'}});
  await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+runtime.server.address().port;
  try {
    const denied=await fetch(base+'/api/state',{headers:{'oai-authenticated-user-id':'spoofed'}});assert.equal(denied.status,401);
    assert.equal((await fetch(base)).status,401);
    const ok=await fetch(base+'/api/state',{headers:{authorization:'Basic '+Buffer.from('owner:correct-test-password').toString('base64')}});assert.equal(ok.status,200);
  }finally{await runtime.close();}
});
test('scheduled ticks skip disabled or recently checked sources',async()=>{
  const db=openDatabase(':memory:'),repo=new Repository(db);await repo.initialize();
  try {
    for(const source of await repo.sources())await repo.sourceResult(source.id,'healthy',null);
    assert.equal(await scheduledTick(repo,{}),null);
    for(const source of await repo.sources())await repo.toggleSource(source.id,false);
    assert.equal(await scheduledTick(repo,{}),null);
  }finally{db.close();}
});
