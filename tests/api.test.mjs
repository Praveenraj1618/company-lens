import assert from 'node:assert/strict';
import test from 'node:test';
import { testDatabase } from './support.mjs';
import { Repository } from '../db/index.ts';
import { handleApi } from '../lib/api.ts';
import { initialSources } from '../lib/catalog.ts';
import { ingestSource } from '../lib/pipeline.ts';
const request=(path,method='GET',body,headers={})=>new Request('http://localhost'+path,{method,headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});

test('persistent workflow: bootstrap, import, deduplicate, isolate companies, query and export',async()=>{
 const db=testDatabase(),env={DB:db,ALLOW_LOCAL_DEV:'true'};
 try {
  assert.equal((await handleApi(request('/api/bootstrap','POST',{}),env)).status,200);
  await handleApi(request('/api/bootstrap','POST',{}),env);
  let state=await (await handleApi(request('/api/state?company=infosys'),env)).json();assert.equal(state.companies.length,21);assert.equal(state.sources.length,initialSources.length);assert.equal(state.articles.length,0);
  const body={companyId:'infosys',url:'https://example.com/infosys-training',title:'Infosys opens a training centre',text:'Infosys announced a new training centre. The centre will offer courses for employees in software engineering and data analysis. The company has not yet published enrolment figures.'};
  const imported=await handleApi(request('/api/import','POST',body),env);assert.equal(imported.status,201);
  const duplicate=await handleApi(request('/api/import','POST',body),env);assert.equal(duplicate.status,409);
  state=await (await handleApi(request('/api/state?company=infosys'),env)).json();assert.equal(state.articles.length,1);assert.equal(state.articles[0].analysis.mode,'baseline');assert.equal(state.articles[0].embedding,null);
  const other=await (await handleApi(request('/api/state?company=wipro'),env)).json();assert.equal(other.articles.length,0);
  const answer=await (await handleApi(request('/api/ask','POST',{companyId:'infosys',question:'training centre'}),env)).json();assert.equal(answer.mode,'extractive');assert.equal(answer.citations.length,1);
  const digest=await handleApi(request('/api/export?company=infosys'),env);assert.equal(digest.status,200);assert.match(await digest.text(),/example.com\/infosys-training/);
  const reopened=new Repository(db);assert.equal((await reopened.articles('infosys')).length,1);
 }finally{db.close();}
});
test('source ingestion matches all watched companies, is idempotent and stores run history',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();
 try {
  const loader=async()=>[{title:'Infosys announces a research programme',text:'Infosys announced a research programme with local universities. The programme will focus on data analysis and software engineering.',url:'https://example.com/research',publishedAt:'2026-09-01T09:00:00Z',language:'en',scope:'feed-excerpt'},{title:'Unrelated news',text:'A different organization announced a change.',url:'https://example.com/other',publishedAt:null,language:'en',scope:'feed-excerpt'}];
  const first=await ingestSource(repo,{},'et-cfo',loader);assert.equal(first.inserted,1);assert.equal(first.matched,1);assert.equal(first.status,'success');
  const second=await ingestSource(repo,{},'et-cfo',loader);assert.equal(second.inserted,0);assert.equal(second.duplicates,1);assert.equal((await repo.runs()).length,2);
  const failed=await ingestSource(repo,{},'et-cfo',async()=>{throw new Error('HTTP 403');});assert.equal(failed.status,'error');assert.equal((await repo.sources()).find(s=>s.id==='et-cfo').status,'error');
  assert.equal(await repo.acquire('unique',30),true);assert.equal(await repo.acquire('unique',30),false);
 }finally{db.close();}
});
test('API enforces authentication, origin, JSON input and validated companies',async()=>{
 const db=testDatabase(),env={DB:db,ALLOW_LOCAL_DEV:'true'};
 try {
  assert.equal((await handleApi(request('/api/state'),{DB:db})).status,401);
  assert.equal((await handleApi(request('/api/cron','POST',{}),{DB:db})).status,401);
  await handleApi(request('/api/bootstrap','POST',{}),env);
  assert.equal((await handleApi(request('/api/companies','POST',{name:'Example',domain:'example.com'},{origin:'https://evil.example'}),env)).status,400);
  assert.equal((await handleApi(request('/api/companies','POST',{name:'Example',domain:'127.0.0.1'}),env)).status,400);
  assert.equal((await handleApi(request('/api/companies','POST',{name:'Example',domain:'example.com',aliases:['எக்ஸாம்பிள்']}),env)).status,201);
  assert.equal((await handleApi(request('/api/import','POST',{companyId:'demo-aster',url:'https://example.com/a'}),env)).status,400);
  assert.equal((await handleApi(request('/api/sources','PATCH',{id:'et-cfo',enabled:false}),env)).status,200);
  assert.equal((await handleApi(request('/api/ingest','POST',{sourceId:'et-cfo'}),env)).status,400);
 }finally{db.close();}
});

test('catalog upgrade expands an existing workspace and preserves edited companies and paused feeds',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();
 try {
  const company=(await repo.companies()).find(c=>c.id==='infosys');company.aliases=['My verified alias'];await repo.putCompany(company);await repo.toggleSource('et-cfo',false);
  await repo.db.prepare("DELETE FROM companies WHERE id='vee-technologies'").run();await repo.db.prepare("DELETE FROM sources WHERE id='eastmojo'").run();
  await repo.setSetting('catalogVersion','old');await repo.setSetting('initialized','1');await repo.initialize();await repo.initialize();
  assert.equal((await repo.companies()).length,20);assert.equal((await repo.sources()).length,initialSources.length);
  assert.deepEqual((await repo.companies()).find(c=>c.id==='infosys').aliases,['My verified alias']);assert.equal((await repo.sources()).find(s=>s.id==='et-cfo').enabled,false);
  assert.ok((await repo.companies()).some(c=>c.id==='vee-technologies'));
 } finally {db.close();}
});

test('service authentication is exact and restricted to maintenance and coverage routes',async()=>{
 const {authenticated}=await import('../lib/api.ts');
 const env={SITES_SERVICE_TOKEN:'test-service-secret'};
 assert.equal(await authenticated(request('/api/sync','POST',{}, {'oai-sites-authorization':'Bearer test-service-secret'}),env),true);
 assert.equal(await authenticated(request('/api/sync','POST',{}, {'oai-sites-authorization':'Bearer wrong'}),env),false);
 assert.equal(await authenticated(request('/api/companies','POST',{}, {'oai-sites-authorization':'Bearer test-service-secret'}),env),false);
 assert.equal(await authenticated(request('/api/sync','POST',{}, {'oai-sites-authorization':'Bearer test-service-secret'}),{}),false);
});
