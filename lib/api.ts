import { z } from "zod";
import { REGIONS, LANGUAGES } from "./catalog.ts";
import { Repository } from "../db/index.ts";
import { demoArticles, demoCompany } from "./demo.ts";
import { canonicalUrl, detectLanguage, matchesCompany } from "./intelligence.ts";
import { ask, analyze, embed } from "./provider.ts";
import { ingestSource, makeArticle, scheduledTick } from "./pipeline.ts";
import { loadSource, parseDate } from "./sources.ts";
import { InputError, publicUrl, readLimited, sameOriginWrite } from "./safety.ts";
import type { RuntimeEnv } from "./runtime.ts";
import type { AppState, Article, Company, Source } from "./types.ts";

const companyInput = z.object({ id: z.string().max(80).optional(), name: z.string().trim().min(2).max(100), domain: z.string().trim().min(3).max(250), industry: z.string().trim().max(100).default("Other"), aliases: z.array(z.string().trim().min(2).max(100)).max(20).default([]), description: z.string().trim().max(500).default("") });
const sourceInput = z.object({ name: z.string().trim().min(2).max(100), url: z.string().url().max(2000), kind: z.enum(["rss", "web"]), region: z.enum(REGIONS), language: z.string().refine(v => Object.hasOwn(LANGUAGES, v), "Choose a supported language").default("en") });
export async function secretEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
  let result = 0; const first = new Uint8Array(x), second = new Uint8Array(y);
  for (let i = 0; i < first.length; i++) result |= first[i] ^ second[i];
  return result === 0;
}
export async function authenticated(request: Request, env: RuntimeEnv): Promise<boolean> {
  const host = new URL(request.url).hostname;
  if (env.ALLOW_LOCAL_DEV === "true" && ["localhost", "127.0.0.1", "terminal.local"].includes(host)) return true;
  if (env.TRUST_SITES_AUTH === "true" && request.headers.get("oai-authenticated-user-id")) return true;
  const auth = request.headers.get("authorization");
  if (env.DASHBOARD_PASSWORD && auth?.startsWith("Basic ")) {
    try { const decoded = atob(auth.slice(6)); return await secretEqual(decoded.slice(decoded.indexOf(":") + 1), env.DASHBOARD_PASSWORD); } catch { return false; }
  }
  return false;
}
async function payload(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new InputError("Send a JSON request.");
  try { return JSON.parse(await readLimited(new Response(request.body), 64000)); } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("Invalid JSON request.");
  }
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) return json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  if (error instanceof InputError) return json({ error: error.message }, error.status);
  if (error instanceof Error && /UNIQUE constraint/.test(error.message)) return json({ error: "This company website or source URL already exists." }, 409);
  console.error("Company Lens request failed", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "The service couldn't complete this request. Your input has been preserved; please try again." }, 503);
}
export function digest(company: Company, articles: Article[]): string {
  const seen = new Set<string>();
  const unique = articles.filter(a => { if (seen.has(a.clusterId)) return false; seen.add(a.clusterId); return true; });
  return `# ${company.name} — coverage digest\n\nGenerated ${new Date().toISOString()}\n\n${company.demo ? "FICTIONAL DEMONSTRATION. These are invented scenarios.\n\n" : ""}Coverage is limited to the latest 300 stored articles from monitored sources. Related coverage is grouped by a conservative text-similarity heuristic, not independently verified.\n\n` + unique.map(a => `## ${a.analysis.translatedTitle || a.title}\n\n${a.publishedAt ? a.publishedAt.slice(0, 10) : "Publication date unknown"} · ${a.region} · ${a.analysis.eventType} · ${a.analysis.sentiment}\n\n${a.analysis.summary}\n\nSource: ${a.sourceName}\n${a.url}\n\nAnalysis: ${a.analysis.mode}; content: ${a.contentScope}.\n\n${a.analysis.impacts.map(i => `- ${i.stakeholder} (${i.direction}): ${i.explanation}`).join("\n")}\n\nUncertainty: ${a.analysis.uncertainty}\n`).join("\n---\n\n");
}
export async function handleApi(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  try {
    if (path === "/api/health") return json({ status: "ok", service: "company-lens" });
    if (path === "/api/cron") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      if (!env.CRON_SECRET || !await secretEqual(request.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`)) return json({ error: "Unauthorized." }, 401);
      const run = await scheduledTick(new Repository(env.DB), env); return json({ run });
    }
    if (!await authenticated(request, env)) return new Response(JSON.stringify({ error: "Sign in to access this workspace." }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store", ...(env.DASHBOARD_PASSWORD ? { "www-authenticate": 'Basic realm="Company Lens", charset="UTF-8"' } : {}) } });
    if (!["GET", "HEAD"].includes(request.method)) sameOriginWrite(request);
    const repo = new Repository(env.DB);
    if (path === "/api/bootstrap" && request.method === "POST") { await repo.initialize(); return json({ ready: true }); }
    if (path === "/api/state" && request.method === "GET") {
      const companyId = url.searchParams.get("company") ?? demoCompany.id;
      const [companies, sources, articles, runs, autoRefresh, lastScheduledAt] = await Promise.all([repo.companies(), repo.sources(), companyId === demoCompany.id ? demoArticles : repo.articles(companyId), repo.runs(), repo.getSetting("autoRefresh"), repo.getSetting("lastScheduledAt")]);
      const state: AppState = { companies: [demoCompany, ...companies], sources, articles: articles.map(a => ({ ...a, embedding: null })), runs, capabilities: { llm: !!env.OPENAI_API_KEY, embeddings: !!env.OPENAI_API_KEY, model: env.OPENAI_MODEL || "gpt-4o-mini", autoRefresh: autoRefresh === "true", lastScheduledAt } };
      return json(state);
    }
    if (path === "/api/companies" && request.method === "POST") {
      const data = companyInput.parse(await payload(request)), current = await repo.companies();
      if (data.id && !current.some(c => c.id === data.id)) throw new InputError("Company was not found.");
      if (!data.id && current.length >= 75) throw new InputError("This workspace supports 75 companies.");
      const domain = publicUrl(data.domain.startsWith("https://") ? data.domain : `https://${data.domain}`).hostname;
      const company: Company = { ...data, id: data.id || crypto.randomUUID(), domain, createdAt: current.find(c => c.id === data.id)?.createdAt || new Date().toISOString(), demo: false };
      await repo.putCompany(company); return json({ company }, 201);
    }
    if (path === "/api/sources" && request.method === "POST") {
      const data = sourceInput.parse(await payload(request)); publicUrl(data.url);
      if ((await repo.sources()).length >= 250) throw new InputError("This workspace supports 250 sources.");
      const source: Source = { ...data, url: canonicalUrl(data.url), id: crypto.randomUUID(), enabled: true, status: "unfetched", lastFetchedAt: null, error: null };
      await repo.putSource(source); return json({ source }, 201);
    }
    if (path === "/api/sources" && request.method === "PATCH") {
      const data = z.object({ id: z.string().max(80), enabled: z.boolean() }).parse(await payload(request));
      if (!(await repo.sources()).some(s => s.id === data.id)) throw new InputError("Source was not found.");
      await repo.toggleSource(data.id, data.enabled); return json({ saved: true });
    }
    if (path === "/api/ingest" && request.method === "POST") {
      const data = z.object({ sourceId: z.string().min(1).max(80) }).parse(await payload(request));
      if (!await repo.acquire(`cooldown:${data.sourceId}`, 60)) return json({ error: "Please wait a minute before refreshing this source again." }, 429);
      const run = await ingestSource(repo, env, data.sourceId); return json({ run });
    }
    if (path === "/api/import" && request.method === "POST") {
      const data = z.object({ companyId: z.string().max(80), url: z.string().url().max(2000), title: z.string().trim().max(500).optional(), text: z.string().trim().max(14000).optional(), publishedAt: z.string().max(50).optional(), region: z.enum(REGIONS).default("India"), language: z.string().refine(v => Object.hasOwn(LANGUAGES, v), "Choose a supported language").default("en") }).parse(await payload(request));
      const website = publicUrl(data.url), company = (await repo.companies()).find(c => c.id === data.companyId);
      if (!company) throw new InputError("Select a real company from your watchlist.");
      if (await repo.exists(company.id, canonicalUrl(data.url))) return json({ error: "This article is already in the company timeline." }, 409);
      const source: Source = { id: `import:${website.hostname}`, name: website.hostname, url: data.url, kind: "web", region: data.region, language: data.language, enabled: true, status: "unfetched", lastFetchedAt: null, error: null };
      if (data.text && (!data.title || data.text.length < 80)) throw new InputError("Pasted excerpts need a title and at least 80 characters of text.");
      const item = data.text ? { title: data.title!, text: data.text, url: data.url, publishedAt: parseDate(data.publishedAt ?? ""), language: detectLanguage(data.text,data.language), scope: "article" as const } : (await loadSource(source))[0];
      if (!matchesCompany(`${item.title}\n${item.text}`, company)) throw new InputError("The company or its aliases weren't found in this text. Review the company aliases or choose another article.");
      const { article, warning } = await makeArticle(env,item,source,company,await repo.articles(company.id),!!data.text);
      await repo.insertArticle(article); return json({ article: { ...article, embedding: null }, warning }, 201);
    }
    if (path === "/api/ask" && request.method === "POST") {
      const data = z.object({ companyId: z.string().max(80), question: z.string().trim().min(5).max(700), days: z.number().int().min(0).max(3650).default(0) }).parse(await payload(request));
      if (!await repo.acquire("ask-cooldown", 2)) return json({ error: "Please wait a moment before asking another question." }, 429);
      const all = data.companyId === demoCompany.id ? demoArticles : await repo.articles(data.companyId);
      const articles = data.days && data.companyId !== demoCompany.id ? all.filter(a => a.publishedAt && Date.parse(a.publishedAt) >= Date.now()-data.days*86400000) : all;
      return json(await ask(env,data.question,articles));
    }
    if (path === "/api/enrich" && request.method === "POST") {
      if (!env.OPENAI_API_KEY) throw new InputError("Configure the server AI key before enriching stored articles.");
      const data = z.object({ companyId: z.string().max(80) }).parse(await payload(request));
      const company = (await repo.companies()).find(c => c.id === data.companyId);
      if (!company) throw new InputError("Choose a real company.");
      const pending = (await repo.articles(company.id)).filter(a => a.analysis.mode !== "model" || !a.embedding || a.embeddingModel !== (env.EMBEDDING_MODEL || "text-embedding-3-small"));
      let updated = 0;
      for (const article of pending.slice(0, 3)) {
        article.analysis = await analyze(env,article.title,article.text,company.name);
        article.embedding = await embed(env,article.title+"\n"+article.text);
        article.embeddingModel = env.EMBEDDING_MODEL || "text-embedding-3-small";
        await repo.updateAnalysis(article); updated++;
      }
      return json({ updated, remaining: pending.length-updated });
    }
    if (path === "/api/settings" && request.method === "PATCH") {
      const data = z.object({ autoRefresh: z.boolean() }).parse(await payload(request));
      await repo.setSetting("autoRefresh", String(data.autoRefresh)); return json({ saved: true });
    }
    if (path === "/api/tick" && request.method === "POST") {
      if (await repo.getSetting("autoRefresh") !== "true") return json({ run: null });
      return json({ run: await scheduledTick(repo,env) });
    }
    if (path === "/api/export" && request.method === "GET") {
      const companyId = url.searchParams.get("company") ?? demoCompany.id;
      const company = companyId === demoCompany.id ? demoCompany : (await repo.companies()).find(c => c.id === companyId);
      if (!company) throw new InputError("Company was not found.");
      const articles = company.demo ? demoArticles : await repo.articles(companyId);
      return new Response(digest(company,articles), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="company-lens-digest.md"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    return json({ error: "Endpoint or method not found." }, 404);
  } catch (error) { return errorResponse(error); }
}
