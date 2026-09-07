import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { testDatabase } from './support.mjs';
import { Repository } from '../db/index.ts';
import { sealKey, openKey, saveAiSettings, aiStatus, modelEnvironment } from '../lib/ai-settings.ts';
import { createBackfill, backfillStep, validateRange, eligibleHistorical, importHistoricalUrls } from '../lib/backfill.ts';
import { jobs } from '../lib/jobs.ts';
import { uploadDocument, documentStep, inspectPdf, boundedBytes } from '../lib/documents.ts';
import { diagnostics } from '../lib/maintenance.ts';
import { extractPage } from '../lib/sources.ts';

test('API keys are authenticated encrypted, never returned, and failed replacements preserve working keys',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();const env={DB:db,CREDENTIAL_ENCRYPTION_KEY:'a'.repeat(64)};
 try {
  const secret='sk-test-secret-not-a-real-key-12345',sealed=await sealKey(env,secret);assert.equal(await openKey(env,sealed),secret);assert.ok(!JSON.stringify(sealed).includes(secret));
  await assert.rejects(()=>openKey({...env,CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64)},sealed));
  await saveAiSettings(repo,env,{apiKey:secret,autoEnrich:true,dailyLimit:20},async()=>new Response('{}'));
  assert.equal((await modelEnvironment(repo,env)).OPENAI_API_KEY,secret);assert.ok(!JSON.stringify(await aiStatus(repo,env)).includes(secret));
  await assert.rejects(()=>saveAiSettings(repo,env,{apiKey:'sk-bad-replacement-key-123456789',autoEnrich:true,dailyLimit:20},async()=>new Response('{}',{status:401})));
  assert.equal((await modelEnvironment(repo,env)).OPENAI_API_KEY,secret);
 }finally{db.close()}
});
test('historical imports enforce publisher, company and publication date; cursor resumes and duplicates do not inflate storage',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();
 try {
  const from=new Date(Date.now()-10*86400000).toISOString().slice(0,10),to=new Date().toISOString().slice(0,10);
  const {created}=await createBackfill(repo,{companyIds:['infosys'],from,to});
  await assert.rejects(()=>importHistoricalUrls(repo,{jobId:created[0],urls:['https://unmonitored.example.com/a']}));
  const source=(await repo.sources()).find(s=>s.id==='et-cfo'),host=new URL(source.url).origin;
  await importHistoricalUrls(repo,{jobId:created[0],urls:[host+'/test-one',host+'/test-missing',host+'/test-old']});
  const loader=async s=>[{url:s.url,title:'Infosys announces research',text:'Infosys announced a research programme with local universities and software engineering teams. The programme begins with workshops for employees.',publishedAt:s.url.endsWith('missing')?null:s.url.endsWith('old')?'2020-01-01T00:00:00Z':new Date().toISOString(),language:'en',scope:'article'}];
  for(let i=0;i<3;i++) await backfillStep(repo,fetch,loader);
  const job=(await jobs(repo,'backfill'))[0];assert.equal(job.data.offset,3);assert.equal(job.data.imported,1);assert.equal(job.data.unknownDate,1);assert.equal(job.data.outsideRange,1);assert.equal((await repo.articles('infosys')).length,1);
  assert.equal((await diagnostics(repo,{})).imported,1);assert.throws(()=>validateRange('2026-02-30','2026-03-01'));
  assert.equal(eligibleHistorical({publishedAt:null},{from,to}),'unknownDate');
 }finally{db.close()}
});
test('failed historical discovery leaves an explicit coverage gap and advances to avoid an endless job',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();
 try{
  const today=new Date().toISOString().slice(0,10);await createBackfill(repo,{companyIds:['vee-technologies'],from:today,to:today});
  await backfillStep(repo,async()=>new Response('unavailable',{status:503}));
  const job=(await jobs(repo,'backfill'))[0];assert.equal(job.status,'partial');assert.equal(job.data.imported,0);assert.equal(job.data.failed,1);assert.match(job.data.gaps[0],/503/);
 }finally{db.close()}
});
test('real text PDF stores original bytes, extracts page evidence and imports only company-matching pages',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();const objects=new Map();
 const env={DB:db,BUCKET:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k).slice().buffer}:null,delete:async k=>objects.delete(k)}};
 try{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Infosys announced a new research programme for employees.\nThe programme includes software engineering workshops with universities.',{font,size:11,x:40,y:600});
  pdf.addPage().drawText('This unrelated appendix lists document formatting rules and layout information.\nThere are no company announcements or company names on this page.',{font,size:11,x:40,y:600});
  const raw=await pdf.save(),form=new FormData();form.set('file',new File([raw],'announcement.pdf',{type:'application/pdf'}));form.set('companyId','infosys');form.set('ocr','false');
  const uploaded=await uploadDocument(repo,env,new Request('https://company.example.com/api/documents',{method:'POST',body:form}));assert.equal(uploaded.pageCount,2);assert.equal(objects.size,1);
  await documentStep(repo,env);await documentStep(repo,env);
  const job=(await jobs(repo,'document'))[0];assert.equal(job.status,'completed');assert.equal(job.data.pages.length,2);assert.equal(job.data.pages[0].method,'pdf-text');assert.equal((await repo.articles('infosys')).length,1);assert.equal((await repo.articles('infosys'))[0].contentScope,'pdf-text');
  await assert.rejects(()=>inspectPdf(new TextEncoder().encode('fake PDF')));
 }finally{db.close()}
});
test('scanned PDFs wait for an API key without fabricating text or importing evidence',async()=>{
 const db=testDatabase(),repo=new Repository(db);await repo.initialize();const objects=new Map();const env={DB:db,BUCKET:{put:async(k,v)=>objects.set(k,v),get:async k=>({arrayBuffer:async()=>objects.get(k).slice().buffer}),delete:async()=>{}}};
 try{
  const pdf=await PDFDocument.create();pdf.addPage();const form=new FormData();form.set('file',new File([await pdf.save()],'scan.pdf'));form.set('companyId','infosys');form.set('ocr','true');await uploadDocument(repo,env,new Request('https://company.example.com/api/documents',{method:'POST',body:form}));
  await documentStep(repo,env);assert.equal((await jobs(repo,'document'))[0].status,'waiting-key');assert.equal((await repo.articles('infosys')).length,0);
  await assert.rejects(()=>boundedBytes(new Response('123456').body,5));
 }finally{db.close()}
});
test('JSON-LD publication dates are extracted independently of discovery timestamps',()=>{
 const item=extractPage('<title>Infosys research</title><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-08-20"}</script><article>Infosys announced a new research programme with local universities and software engineering teams. The programme includes employee workshops.</article>','https://example.com/a');
 assert.equal(item.publishedAt,'2026-08-20T00:00:00.000Z');
});
