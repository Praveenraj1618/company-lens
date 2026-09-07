import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { openDatabase } from './sqlite.mjs';
import { Repository } from '../db/index.ts';
import { scheduledCycle } from '../lib/pipeline.ts';

const MIME = { '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.ico':'image/x-icon', '.json':'application/json' };
export function localEnvironment() {
  // .dev.vars is only read on the user's own standalone runtime; real env wins.
  const local = {};
  if (existsSync('.dev.vars')) for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)) {
    const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if(match)local[match[1]]=match[2].replace(/^["']|["']$/g,'');
  }
  return { ...local, ...process.env };
}
export async function createRuntime(options = {}) {
  const config=options.env || localEnvironment(), root=resolve(options.root || '.');
  const db=openDatabase(options.database || config.DATABASE_PATH || resolve(root,'.data/company-lens.sqlite'),resolve(root,'drizzle'));
  await new Repository(db).initialize();
  const publicDir=resolve(root,'dist/client');
  const assets={ async fetch(request) {
    let pathname;try{pathname=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Invalid path',{status:400});}
    const filename=resolve(publicDir,'.'+pathname);
    if(!filename.startsWith(publicDir+sep))return new Response('Not found',{status:404});
    try {
      if(!(await stat(filename)).isFile())return new Response('Not found',{status:404});
      return new Response(await readFile(filename),{headers:{'content-type':MIME[extname(filename)]||'application/octet-stream','x-content-type-options':'nosniff','cache-control':pathname.includes('/assets/')?'public, max-age=31536000, immutable':'public, max-age=300'}});
    }catch{return new Response('Not found',{status:404});}
  }};
  // Standalone mode never trusts user-supplied Sites identity headers.
  const env={...config, DB:db, ASSETS:assets, TRUST_SITES_AUTH:'false'};
  const worker=(await import(pathToFileURL(resolve(root,'dist/server/index.js')).href)).default;
  const pending=new Set();
  const ctx={waitUntil(p){const task=Promise.resolve(p).catch(e=>console.error('Background job failed:',e.message)).finally(()=>pending.delete(task));pending.add(task);},passThroughOnException(){}};
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      let request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method||'GET')?{}:{body:Readable.toWeb(req),duplex:'half'})});
      // Authentication is enforced by worker.fetch before assets are served.
      let response=await worker.fetch(request,env,ctx);
      if(response.status===404&&['GET','HEAD'].includes(req.method||'GET')&&!url.pathname.startsWith('/api/')) response=await assets.fetch(request);
      const headers=Object.fromEntries(response.headers);headers['x-content-type-options']='nosniff';headers['referrer-policy']='strict-origin-when-cross-origin';
      res.writeHead(response.status,headers);
      if(req.method==='HEAD'||!response.body)res.end();else Readable.fromWeb(response.body).pipe(res);
    }catch(e){console.error('Request failed:',e.message);if(!res.headersSent)res.writeHead(500,{'content-type':'text/plain'});res.end('Unable to complete request.');}
  });
  let ticking=false;
  const tick=async()=>{if(ticking)return;ticking=true;try{const runs=await scheduledCycle(new Repository(db),env);if(runs.length)console.log(`Collection: ${runs.length} sources checked; ${runs.reduce((n,r)=>n+r.inserted,0)} new records.`);}catch(e){console.error('Scheduled collection failed:',e.message);}finally{ticking=false;}};
  let timer;
  const startScheduler=()=>{if(config.SCHEDULE_ENABLED==='true'){timer=setInterval(()=>ctx.waitUntil(tick()),300000);timer.unref();ctx.waitUntil(tick());}};
  const close=async()=>{if(timer)clearInterval(timer);await new Promise(resolveClose=>server.close(resolveClose));await Promise.allSettled([...pending]);db.close();};
  return {server,env,startScheduler,close};
}
async function main() {
  const config=localEnvironment(),host=config.HOST||'127.0.0.1',port=Number(config.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
  if(!['127.0.0.1','localhost','::1'].includes(host)&&!config.DASHBOARD_PASSWORD)throw new Error('Set DASHBOARD_PASSWORD before binding to a non-loopback interface.');
  if(config.DASHBOARD_PASSWORD&&config.DASHBOARD_PASSWORD.length<16)throw new Error('Use a DASHBOARD_PASSWORD of at least 16 characters.');
  if(!config.DASHBOARD_PASSWORD)config.ALLOW_LOCAL_DEV='true';
  const runtime=await createRuntime({env:config});
  runtime.server.listen(port,host,()=>{console.log(`Company Lens running at http://${host}:${port}`);runtime.startScheduler();});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void runtime.close().then(()=>process.exit(0)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exit(1);});
