import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { manifestSchema, SNAPSHOT_RETENTION } from '../lib/scheduled-coverage.ts';
const repository=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
if(!token||!repository||!/^[-\w.]+\/[-\w.]+$/.test(repository))throw new Error('Run this publisher inside the authorized GitHub Actions workflow.');
const endpoint=`https://api.github.com/repos/${repository}`;
async function api(path,method='GET',body,allowMissing=false){
 const response=await fetch(endpoint+path,{method,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(response.status===404&&allowMissing)return null;
 if(!response.ok)throw new Error(`GitHub ${method} ${path.split('?')[0]} returned HTTP ${response.status}.`);
 return response.json();
}
const directory=resolve(process.env.COLLECTION_OUTPUT_DIR||'.data/scheduled');
const metadata=JSON.parse(await readFile(resolve(directory,'metadata.json'),'utf8'));
const sealed=await readFile(resolve(directory,'snapshot.json'),'utf8');
const head=await api('/git/ref/heads/coverage-data','GET',null,true);
let previous={version:1,generatedAt:metadata.finishedAt,intervalHours:3,snapshots:[]},baseTree;
if(head){
 const commit=await api(`/git/commits/${head.object.sha}`);baseTree=commit.tree.sha;
 const content=await api(`/contents/manifest.json?ref=${head.object.sha}`);
 previous=manifestSchema.parse(JSON.parse(Buffer.from(content.content,'base64').toString('utf8')));
}
const next=manifestSchema.parse({version:1,generatedAt:metadata.finishedAt,intervalHours:3,snapshots:[...previous.snapshots.filter(s=>s.id!==metadata.id),{id:metadata.id,finishedAt:metadata.finishedAt,sha256:createHash('sha256').update(sealed).digest('hex')}].sort((a,b)=>a.id.localeCompare(b.id)).slice(-SNAPSHOT_RETENTION)});
const tree=[{path:'manifest.json',mode:'100644',type:'blob',content:JSON.stringify(next,null,2)+'\n'},{path:`snapshots/${metadata.id}.json`,mode:'100644',type:'blob',content:sealed}];
for(const old of previous.snapshots)if(!next.snapshots.some(s=>s.id===old.id))tree.push({path:`snapshots/${old.id}.json`,mode:'100644',type:'blob',sha:null});
const built=await api('/git/trees','POST',{...(baseTree?{base_tree:baseTree}:{}),tree});
const commit=await api('/git/commits','POST',{message:`chore: encrypted coverage ${metadata.finishedAt}`,tree:built.sha,parents:head?[head.object.sha]:[]});
if(head)await api('/git/refs/heads/coverage-data','PATCH',{sha:commit.sha,force:false});
else await api('/git/refs','POST',{ref:'refs/heads/coverage-data',sha:commit.sha});
console.log(`Published encrypted snapshot ${metadata.id}; ${next.snapshots.length} snapshots in the seven-day sync window. Source main is unchanged.`);
