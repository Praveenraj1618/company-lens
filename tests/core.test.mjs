import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineAnalysis, bm25, canonicalUrl, clusterFor, cosine, evidenceSupported, fingerprint, matchesCompany, reciprocalRankFusion } from '../lib/intelligence.ts';
import { parseFeed, extractPage, parseDate, robotsAllows } from '../lib/sources.ts';
import { publicUrl, publicAddress, fetchPublic, readLimited } from '../lib/safety.ts';
import { analyze, ask } from '../lib/provider.ts';
import { demoArticles } from '../lib/demo.ts';

test('company matching handles regional aliases and avoids embedded abbreviations',()=>{
 const c={name:'Tata Consultancy Services',aliases:['TCS','டிசிஎஸ்']};
 assert.equal(matchesCompany('TCS announces results',c),true);
 assert.equal(matchesCompany('ATCSoftware announces results',c),false);
 assert.equal(matchesCompany('டிசிஎஸ் நிறுவனம் புதிய அறிவிப்பு',c),true);
 assert.equal(matchesCompany('unrelated company',c),false);
});
test('URL normalization removes tracking, retains substantive query parameters',()=>{
 assert.equal(canonicalUrl('https://example.com/news/?id=2&utm_source=rss#top'),'https://example.com/news?id=2');
 assert.notEqual(canonicalUrl('https://example.com/?id=2'),canonicalUrl('https://example.com/?id=3'));
});
test('baseline flags negated layoffs as unclear and never invents stakeholder impacts',()=>{
 const a=baselineAnalysis('Company denies layoffs','The company denies layoffs and has not announced any workforce reductions.');
 assert.equal(a.sentiment,'unclear');assert.equal(a.mode,'baseline');assert.deepEqual(a.impacts,[]);
 assert.equal(baselineAnalysis('Company reports layoffs','The company announced layoffs in its customer support division.').sentiment,'negative');
});
test('retrieval ranks relevant passages and abstains on zero overlap',()=>{
 const docs=[{id:'one',text:'battery charger recall'},{id:'two',text:'hiring researchers and factory staff'}];
 assert.equal(bm25('charger recall',docs)[0].id,'one');assert.deepEqual(bm25('volcanic eruption',docs),[]);
 assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1],[1,0]),0);
 assert.equal(reciprocalRankFusion([[{id:'a',score:3},{id:'b',score:2}],[{id:'b',score:2},{id:'c',score:1}]])[0].id,'b');
});
test('clustering groups repeats within company and time window',()=>{
 const a=demoArticles[0];assert.equal(clusterFor({...a,id:'new'},[a]),a.clusterId);
 assert.equal(clusterFor({...a,id:'new',companyId:'other'},[a]),'new');
 assert.equal(clusterFor({...a,id:'new',contentHash:'different',publishedAt:'2020-01-01T00:00:00Z'},[a]),'new');
});
test('content hashing and quotation validation normalize whitespace only',async()=>{
 assert.equal(await fingerprint('Aster  results'),await fingerprint('aster results'));
 assert.equal(evidenceSupported('The source reports revenue growth','The source reports   revenue growth this quarter.'),true);
 assert.equal(evidenceSupported('The source reports a data breach','The source reports revenue growth.'),false);
});
test('RSS handles CDATA, tracking URLs, missing dates, and unsafe entries',()=>{
 const xml='<rss><channel><item><title>Aster &amp; partners</title><link>https://example.com/a?utm_source=rss</link><description><![CDATA[<p>Aster expands.</p>]]></description></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>';
 const rows=parseFeed(xml,'https://example.com/feed');assert.equal(rows.length,1);assert.equal(rows[0].title,'Aster & partners');assert.equal(rows[0].text,'Aster expands.');assert.equal(rows[0].publishedAt,null);
});
test('Atom uses alternate article link and preserves Tamil text',()=>{
 const rows=parseFeed('<feed><entry><title>இன்ஃபோசிஸ் அறிவிப்பு</title><link rel="self" href="https://example.com/api/1"/><link rel="alternate" href="/story"/><summary>நிறுவனம் புதிய அறிவிப்பை வெளியிட்டது.</summary><published>2026-09-01T08:00:00Z</published></entry></feed>','https://example.com/feed');
 assert.equal(rows[0].url,'https://example.com/story');assert.equal(rows[0].language,'ta');assert.ok(rows[0].publishedAt);
});
test('untrusted XML declarations are rejected before parsing',()=>{
 assert.throws(()=>parseFeed('<!DOCTYPE x [<!ENTITY a "spam">]><rss/>','https://example.com/feed'));
 assert.throws(()=>parseFeed('<html><body>Access denied</body></html>','https://example.com/feed'));
});
test('publication dates are not fabricated from collection time',()=>{
 assert.equal(parseDate(''),null);assert.equal(parseDate('not a date'),null);assert.equal(parseDate('2100-01-01'),null);
});
test('HTML extraction prefers article content and removes script/nav content',()=>{
 const row=extractPage('<title>Company news</title><nav>unrelated</nav><article><h1>Aster company news</h1><script>steal secrets</script><p>Aster announced a new research centre with plans for local hiring and a programme to improve battery safety testing.</p></article>','https://example.com/a');
 assert.equal(row.title,'Aster company news');assert.ok(!row.text.includes('steal'));assert.ok(!row.text.includes('unrelated'));
});
test('robots policy uses specific agent and longest matching rule',()=>{
 assert.equal(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/a'),false);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private/public','/private/public/a'),true);
 assert.equal(robotsAllows('User-agent: *\nDisallow: /\nUser-agent: CompanyLens\nAllow: /news','/news/a'),true);
});
test('SSRF defenses reject IP forms, credentials, local hostnames, and non-HTTPS',()=>{
 for(const u of ['http://example.com','https://127.0.0.1','https://2130706433','https://[::1]','https://admin:pw@example.com','https://x.internal','https://example.com:8443','https://127.0.0.1.nip.io'])assert.throws(()=>publicUrl(u),u);
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','::1','fd00::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('93.184.216.34'),true);
});
test('redirect destination is revalidated and bodies are bounded',async()=>{
 const mock=async url=>String(url).includes('dns-query')?Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]}):new Response('',{status:302,headers:{location:'https://127.0.0.1'}});
 await assert.rejects(fetchPublic('https://example.com/news','text/html',mock));
 await assert.rejects(readLimited(new Response('123456'),5));
});
test('no-key answers expose passages and abstain on unsupported questions',async()=>{
 const a=await ask({},'charger recall',demoArticles);assert.equal(a.mode,'extractive');assert.ok(a.citations.length);assert.ok(a.citations.every(c=>c.url.startsWith('https://')));
 const absent=await ask({},'volcanic eruption',demoArticles);assert.equal(absent.insufficientEvidence,true);assert.deepEqual(absent.citations,[]);
});
test('model output with an invented supporting quote is rejected',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({eventType:'Financial results',sentiment:'positive',summary:'Invented',facts:[{claim:'Revenue doubled',quote:'Revenue doubled in the quarter.'}],impacts:[],uncertainty:'unknown',translatedTitle:null,translatedText:null})}}]});
 try { await assert.rejects(analyze({OPENAI_API_KEY:'test'},'Company update','The company opened a training centre.','Company'),/evidence validation/); }
 finally {globalThis.fetch=previous;}
});

test('regional catalog has 100 Indian and 15 global feeds with valid, unique identifiers and geography',async()=>{
 const {initialSources,initialCompanies,REGIONS,sourceZone}=await import('../lib/catalog.ts');
 const {detectLanguage}=await import('../lib/intelligence.ts');
 assert.equal(initialSources.filter(s=>s.region!=='Global').length,100);assert.equal(initialSources.filter(s=>s.region==='Global').length,15);
 assert.equal(new Set(initialSources.map(s=>s.url)).size,115);assert.equal(new Set(initialSources.map(s=>s.id)).size,115);
 for(const s of initialSources){assert.ok(REGIONS.includes(s.region));assert.equal(new URL(s.url).protocol,'https:');assert.equal(s.status,'unfetched');}
 for(const zone of ['North','South','East','West','Central','North East'])assert.ok(initialSources.some(s=>sourceZone(s.region)===zone));
 const vee=initialCompanies.find(c=>c.id==='vee-technologies');assert.ok(matchesCompany('Vee Technologies Pvt Ltd opens a training centre',vee));assert.equal(matchesCompany('Vee speaks about technology at school',vee),false);
 assert.equal(detectLanguage('ಕರ್ನಾಟಕದ ಕಂಪನಿಯ ಸುದ್ದಿ'),'kn');assert.equal(detectLanguage('కంపెనీ వార్తలు'),'te');assert.equal(detectLanguage('कंपनी','mr'),'mr');
});


test('public DNS classification keeps public publisher networks while excluding exact reserved prefixes',async()=>{
 const {publicAddress}=await import('../lib/safety.ts');
 for(const ip of ['192.0.78.24','192.0.78.25','203.0.178.1','2001:4860:4860::8888'])assert.equal(publicAddress(ip),true,ip);
 for(const ip of ['192.0.0.1','192.0.2.1','192.168.1.1','198.51.100.12','203.0.113.5','2001:db8::1','2001:0::1','2002::1','3fff:0::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
});
