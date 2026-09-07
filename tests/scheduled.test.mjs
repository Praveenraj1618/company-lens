import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Repository } from '../db/index.ts';
import { testDatabase } from './support.mjs';
import { collectCatalog, sealSnapshot, openSnapshot } from '../lib/scheduled-coverage.ts';
import { syncCoverage, scheduleStatus } from '../lib/coverage-sync.ts';
import { scheduledCycle, scheduledTick } from '../lib/pipeline.ts';
import { initialSources } from '../lib/catalog.ts';
const source=initialSources.find(s=>s.id==='et-cfo');
const item=(index=0)=>({title:`Vee Technologies opens centre ${index}`,text:'Vee Technologies announced a new delivery centre and training programme. The company says the programme will support employees in analytics and software services.',url:`https://example.com/vee-${index}`,publishedAt:'2026-09-01T09:00:00.000Z',language:'en',scope:'feed-excerpt'});
const keypair=async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['wrapKey','unwrapKey']);
 return {public:await crypto.subtle.exportKey('jwk',keys.publicKey),private:await crypto.subtle.exportKey('jwk',keys.privateKey)};
};

test('scheduled collector handles all feeds, isolates failures and serializes same-host requests',async()=>{
 const feeds=initialSources.slice(0,12);let active=0,max=0;const hosts=new Set();
 const snapshot=await collectCatalog(async s=>{
  const host=new URL(s.url).hostname;assert.equal(hosts.has(host),false);hosts.add(host);max=Math.max(max,++active);
  await new Promise(r=>setTimeout(r,2));active--;hosts.delete(host);
  if(s.id===feeds[2].id)throw new Error('Access denied');return [item()];
 },feeds);
 assert.equal(snapshot.sources.length,feeds.length);assert.equal(snapshot.sources.filter(s=>s.status==='error').length,1);
 assert.equal(snapshot.items.length,feeds.length-1);assert.ok(max<=4);assert.ok(snapshot.items.every(i=>i.companyId==='vee-technologies'));
});

test('encrypted snapshot round trip preserves regional text and rejects tampering and the wrong key',async()=>{
 const keys=await keypair(),wrong=await keypair();const snapshot=await collectCatalog(async()=>[item()], [source]);
 snapshot.items[0].item.text+=' ಕನ್ನಡ മലയാളം తెలుగు';
 const sealed=await sealSnapshot(snapshot,keys.public);assert.equal(sealed.includes('Vee Technologies'),false);
 assert.deepEqual(await openSnapshot(sealed,keys.private),snapshot);await assert.rejects(openSnapshot(sealed,wrong.private));
 const changed=JSON.parse(sealed);changed.ciphertext=(changed.ciphertext[0]==='A'?'B':'A')+changed.ciphertext.slice(1);await assert.rejects(openSnapshot(JSON.stringify(changed),keys.private));
});

test('scheduled sync is resumable, private, idempotent and respects source switches',async()=>{
 const db=testDatabase(),repo=new Repository(db),keys=await keypair();await repo.initialize();
 try{
  const snapshot=await collectCatalog(async()=>Array.from({length:45},(_,i)=>item(i)),[source]);const sealed=await sealSnapshot(snapshot,keys.public);
  const manifest={version:1,generatedAt:snapshot.finishedAt,intervalHours:3,snapshots:[{id:snapshot.id,finishedAt:snapshot.finishedAt,sha256:createHash('sha256').update(sealed).digest('hex')}]};
  const fetcher=async url=>new Response(url.endsWith('manifest.json')?JSON.stringify(manifest):sealed,{headers:{'content-type':'application/json'}});
  const env={DB:db,COVERAGE_REPOSITORY:'owner/repo',COVERAGE_PRIVATE_KEY:JSON.stringify(keys.private)};
  const first=await syncCoverage(repo,env,fetcher);assert.equal(first.inserted,40);assert.equal(first.pending,1);
  const second=await syncCoverage(repo,env,fetcher);assert.equal(second.inserted,5);assert.equal(second.pending,0);
  const again=await syncCoverage(repo,env,fetcher);assert.equal(again.inserted,0);assert.equal((await repo.articles('vee-technologies')).length,45);
  assert.equal((await repo.articles('infosys')).length,0);assert.equal((await scheduleStatus(repo,env)).status,'current');
  assert.equal((await repo.sources()).find(s=>s.id===source.id).lastFetchedAt,snapshot.finishedAt);
  const bad=new Repository(testDatabase());await bad.initialize();
  try{await bad.toggleSource(source.id,false);const ignored=await syncCoverage(bad,env,fetcher);assert.equal(ignored.inserted,0);await syncCoverage(bad,env,fetcher);assert.equal((await bad.articles('vee-technologies')).length,0);assert.equal((await bad.sources()).find(s=>s.id===source.id).status,'unfetched');}finally{bad.db.close();}
  await repo.setSetting('autoRefresh','false');assert.equal((await syncCoverage(repo,env,fetcher)).paused,true);
 }finally{db.close();}
});

test('standalone cycle checks every three-hour-due source, suppresses overlap and respects pause',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();
 try{
  const ids=['et-cfo','bbc-business','ht-bhopal'];
  for(const s of await repo.sources())if(!ids.includes(s.id))await repo.toggleSource(s.id,false);
  let calls=0;const loader=async s=>{calls++;if(s.id==='ht-bhopal')throw new Error('Unavailable');return [item()];};
  const runs=await scheduledCycle(repo,{},loader);assert.equal(runs.length,3);assert.equal(calls,3);assert.equal(runs.filter(r=>r.status==='error').length,1);
  assert.equal((await scheduledCycle(repo,{},loader)).length,0);
  await repo.db.prepare('UPDATE sources SET last_fetched_at=? WHERE id=?').bind(new Date(Date.now()-3*3600000-1).toISOString(),'et-cfo').run();
  assert.ok(await scheduledTick(repo,{},loader));
  await repo.acquire('scheduled-cycle',60);assert.equal((await scheduledCycle(repo,{},loader)).length,0);await repo.release('scheduled-cycle');
  await repo.setSetting('autoRefresh','false');assert.equal(await scheduledTick(repo,{},loader),null);
 }finally{db.close();}
});
