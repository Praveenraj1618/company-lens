const { COMPANY_LENS_URL, CRON_SECRET }=process.env;
if(!COMPANY_LENS_URL||!CRON_SECRET)throw new Error('Set COMPANY_LENS_URL and CRON_SECRET in the repository settings.');
const base=new URL(COMPANY_LENS_URL);
if(base.protocol!=='https:'||base.username||base.password)throw new Error('The collection endpoint must be a public HTTPS origin without embedded credentials.');
const response=await fetch(new URL('/api/cron',base),{method:'POST',headers:{authorization:`Bearer ${CRON_SECRET}`},redirect:'error',signal:AbortSignal.timeout(480000)});
if(!response.ok)throw new Error(`Collection request returned HTTP ${response.status}.`);
const data=await response.json();
console.log(data.run?`Source ${data.run.sourceId}: ${data.run.inserted} new records, status ${data.run.status}.`:'No source is due.');
if(data.run?.status==='error')throw new Error('Source collection failed. Review the application collection history.');
