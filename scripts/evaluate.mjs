import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { demoArticles } from '../lib/demo.ts';
import { bm25 } from '../lib/intelligence.ts';

const queries=JSON.parse(readFileSync(new URL('../evaluation/queries.json',import.meta.url),'utf8'));
const modes=['original_text','with_demo_translation'];
const results=modes.map(mode=>{
  const docs=demoArticles.map(a=>({id:a.id,text:`${a.title} ${a.text} ${mode==='with_demo_translation'?(a.analysis.translatedText||''):''}`}));
  const measured=queries.map(q=>{
    const start=performance.now(),rank=bm25(q.question,docs),latencyMs=performance.now()-start;
    const clusters=[...new Set(rank.map(r=>demoArticles.find(a=>a.id===r.id).clusterId))];
    const relevant=q.relevant;
    return {id:q.id,language:q.language,latencyMs,ranking:clusters.slice(0,5),answerable:relevant.length>0,
      recallAt5:relevant.length?relevant.filter(id=>clusters.slice(0,5).includes(id)).length/relevant.length:null,
      reciprocalRank:relevant.length?(clusters.some(id=>relevant.includes(id))?1/(clusters.findIndex(id=>relevant.includes(id))+1):0):null,
      abstained:clusters.length===0};
  });
  // A missing relevant document has reciprocal rank zero, not Infinity.
  for(const row of measured)if(!Number.isFinite(row.reciprocalRank)&&row.reciprocalRank!==null)row.reciprocalRank=0;
  const known=measured.filter(r=>r.answerable),unknown=measured.filter(r=>!r.answerable);
  const mean=(rows,key)=>rows.reduce((s,r)=>s+r[key],0)/Math.max(rows.length,1);
  return {mode,recallAt5:mean(known,'recallAt5'),mrr:mean(known,'reciprocalRank'),unanswerableAbstention:unknown.filter(r=>r.abstained).length/unknown.length,queries:measured};
});
const report={dataset:'Fictional Aster Mobility demonstration',documents:demoArticles.length,distinctStories:new Set(demoArticles.map(a=>a.clusterId)).size,questions:queries.length,limitations:'Small hand-authored smoke fixture, not an independent or real-world benchmark. Demo translations are prewritten; live translation/embedding/LLM quality is not measured. Latency is local retrieval only.',results};
console.log(JSON.stringify(process.argv.includes("--json") ? report : { dataset:report.dataset, questions:report.questions, limitations:report.limitations, results:results.map(({queries,...metrics})=>metrics) },null,2));
if(process.argv.includes('--write')) {
  mkdirSync('evaluation',{recursive:true});
  writeFileSync('evaluation/latest.json',JSON.stringify(report,null,2)+'\n');
}
