"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3, FileText, Globe2, Languages, Layers3, Loader2, MessageSquareText, Pencil, Plus, Radar, RefreshCw, Rss, ScanSearch, Search, Settings2, ShieldCheck, Sparkles, X } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { AISettings, DataWorkspace } from "./data-workspace";
import { SourceDirectory } from "./source-directory";
import { LANGUAGES, REGIONS, sourceZone, sourcePublisher, initialSources, initialCompanies } from "@/lib/catalog";
import { demoArticles, demoCompany } from "@/lib/demo";
import type { Answer, AppState, Article, Company, Run, Sentiment } from "@/lib/types";

type View = "overview" | "sources" | "ask" | "activity" | "data" | "settings";
type Modal = "company" | "source" | "import" | null;
const toneNames: Record<Sentiment, string> = { positive: "Positive", negative: "Negative", mixed: "Mixed", unclear: "Unclear" };
const langNames: Record<string, string> = LANGUAGES;
const nav = [{ id: "overview", title: "Overview", icon: ScanSearch }, { id: "ask", title: "Ask Lens", icon: MessageSquareText }, { id: "sources", title: "Sources", icon: Rss }, { id: "data", title: "Data & imports", icon: FileText }, { id: "activity", title: "Collection activity", icon: Activity }] as const;
const initial: AppState = { companies: [demoCompany, ...initialCompanies], sources: initialSources, articles: demoArticles, runs: [], capabilities: { llm: false, embeddings: false, model: "gpt-4o-mini", autoRefresh: true, lastScheduledAt: null, schedule: { mode: "browser", intervalHours: 3, status: "waiting", lastRunAt: null, lastSyncedAt: null, nextRunAt: null, healthy: 0, failed: 0, pending: 0, error: null } } };
function prettyDate(value: string | null, time = false): string {
  if (!value) return "Not yet collected";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Kolkata" }).format(new Date(value));
}
function shortName(c: Company): string { return c.id === "tcs" ? "TCS" : c.name; }
function Tone({ value }: { value: Sentiment }) { return <span className={`tone tone-${value}`}>{toneNames[value]}</span>; }
function Picker({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data;
  try { data = await response.json(); } catch { throw new Error("The server returned an unreadable response. Please try again."); }
  if (!response.ok) throw new Error(data.error || "The request couldn't be completed.");
  return data as T;
}
function Navigation({ state, selected, view, choose, setView, add }: { state: AppState; selected: string; view: View; choose: (id: string) => void; setView: (view: View) => void; add: () => void }) {
  const { setOpenMobile } = useSidebar();
  const [companySearch, setCompanySearch] = useState("");
  return <Sidebar className="lens-sidebar" collapsible="offcanvas">
    <SidebarHeader className="lens-sidebar-header"><Link href="/" className="brand"><span className="brand-symbol"><Radar size={25} strokeWidth={1.8} /></span><span>company<span className="brand-light">lens</span></span></Link><span className="workspace-label">INTELLIGENCE WORKSPACE</span></SidebarHeader>
    <SidebarContent>
      <SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarMenu>{nav.map(n => <SidebarMenuItem key={n.id}><SidebarMenuButton isActive={view === n.id} onClick={() => { setView(n.id); setOpenMobile(false); }}><n.icon /><span>{n.title}</span>{n.id === "ask" && <span className="nav-new">AI</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>
      <SidebarGroup className="watchlist"><div className="watchlist-label"><SidebarGroupLabel>Watchlist <span className="watchlist-count">{state.companies.filter(c=>!c.demo).length}</span></SidebarGroupLabel><button onClick={add} aria-label="Add a company"><Plus size={16} /></button></div><div className="watchlist-search"><Search size={14}/><Input value={companySearch} onChange={e=>setCompanySearch(e.target.value)} placeholder="Find a company…" aria-label="Search company watchlist"/></div><SidebarMenu>{state.companies.filter(c => !c.demo && `${c.name} ${c.aliases.join(" ")}`.toLowerCase().includes(companySearch.toLowerCase())).map((c,i) => <SidebarMenuItem key={c.id}><SidebarMenuButton isActive={selected === c.id} onClick={() => { choose(c.id); setOpenMobile(false); }}><span className={`company-dot dot-${i%4}`}>{shortName(c).slice(0,1)}</span><span>{shortName(c)}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>
      <div className="demo-switch"><p>Explore the product</p><button className={selected === demoCompany.id ? "selected" : ""} onClick={() => { choose(demoCompany.id); setOpenMobile(false); }}><Layers3 size={17} /><span>Sample company</span><ChevronRight size={15} /></button></div>
    </SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive={view === "settings"} onClick={() => { setView("settings"); setOpenMobile(false); }}><Settings2 /><span>Settings & methodology</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu><div className="sidebar-owner"><span className="avatar">PR</span><div><strong>Praveen’s workspace</strong><span>Company intelligence</span></div></div></SidebarFooter>
  </Sidebar>;
}
export default function CompanyLens() {
  const [state, setState] = useState<AppState>(initial);
  const [now, setNow] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false), stopCollection = useRef(false);
  const [selected, setSelected] = useState(demoCompany.id);
  const selectedRef = useRef(selected);
  const requestSequence = useRef(0);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [search, setSearch] = useState(""), [tone, setTone] = useState("all"), [language, setLanguage] = useState("all"), [days, setDays] = useState("0");
  const [modal, setModal] = useState<Modal>(null), [editing, setEditing] = useState<Company | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState("");
  const [collecting, setCollecting] = useState(false), [collection, setCollection] = useState({ done: 0, total: 0, label: "" });
  const [question, setQuestion] = useState(""), [answer, setAnswer] = useState<Answer | null>(null), [asking, setAsking] = useState(false);
  const [sourceRegion, setSourceRegion] = useState("India"), [sourceLanguage, setSourceLanguage] = useState("en"), [sourceKind, setSourceKind] = useState("rss");
  const busyRef = useRef(false), autoRef = useRef(false);
  const company = state.companies.find(c => c.id === selected) ?? demoCompany;
  const refresh = useCallback(async (id = selectedRef.current) => {
    const seq = ++requestSequence.current;
    try {
      const data = await api<AppState>(`/api/state?company=${encodeURIComponent(id)}`);
      if (seq === requestSequence.current) { setState(data); setNow(Date.now()); setError(""); }
    } catch (e) { if (seq === requestSequence.current) setError(e instanceof Error ? e.message : "Couldn't load the workspace."); }
    finally { if (seq === requestSequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true, id = "vee-technologies";
    try { id = localStorage.getItem("company-lens:selected-company") || id; } catch { /* Preferences are optional. */ }
    selectedRef.current = id;
    api("/api/bootstrap", "POST", {}).then(() => { if (active) { setSelected(id); return refresh(id); } }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [refresh]);
  const choose = (id: string) => {
    selectedRef.current = id; setSelected(id); try { localStorage.setItem("company-lens:selected-company",id); } catch {} setView("overview"); setAnswer(null); setQuestion(""); setSearch(""); setTone("all"); setLanguage("all"); setDays("0"); setLoading(true); setArticle(null); void refresh(id);
  };
  const syncScheduled = useCallback(async (manual = false) => {
    if (syncRef.current) return;
    syncRef.current = true; setSyncing(true); let added = 0;
    try {
      for (let batch = 0; batch < 60; batch++) {
        const result = await api<{ inserted: number; pending: number }>("/api/sync", "POST", {}); added += result.inserted;
        if (batch % 5 === 0 || !result.pending) await refresh();
        if (!result.pending || document.hidden) break;
      }
      if (manual) toast.success(`${added} new records synced from scheduled collection.`);
    } catch (e) { if (manual) toast.error(e instanceof Error ? e.message : "Couldn't sync scheduled coverage."); }
    finally { await refresh(); setSyncing(false); syncRef.current = false; }
  }, [refresh]);
  useEffect(() => {
    if (!state.capabilities.autoRefresh || error || loading) return;
    const tick = async () => {
      if (busyRef.current || autoRef.current || document.hidden) return;
      if (state.capabilities.schedule.mode === "github") { await syncScheduled(); return; }
      if (state.capabilities.schedule.mode === "server") { await refresh(); return; }
      autoRef.current = true;
      try { const result = await api<{ run: Run | null }>("/api/tick", "POST", {}); if (result.run) await refresh(); }
      catch { /* Collection activity retains source failures. */ }
      finally { autoRef.current = false; }
    };
    const timer = window.setInterval(tick, 5 * 60000); void tick(); return () => window.clearInterval(timer);
  }, [state.capabilities.autoRefresh, state.capabilities.schedule.mode, error, loading, refresh, syncScheduled]);
  const openModal = (kind: Modal, c: Company | null = null) => { setEditing(c); setFormError(""); setSourceRegion("India"); setSourceLanguage("en"); setSourceKind("rss"); setModal(kind); };
  const filtered = useMemo(() => state.articles.filter(a => {
    if (a.companyId !== selected) return false;
    if (tone !== "all" && a.analysis.sentiment !== tone) return false;
    if (language !== "all" && a.language !== language) return false;
    if (search && !`${a.title} ${a.text} ${a.analysis.translatedTitle ?? ""} ${a.sourceName}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (days !== "0" && !company.demo && (!a.publishedAt || Date.parse(a.publishedAt) < now-Number(days)*86400000)) return false;
    return true;
  }), [state.articles, selected, tone, language, search, days, company.demo, now]);
  const groups = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of filtered) map.set(a.clusterId, [...(map.get(a.clusterId) ?? []),a]);
    return [...map.values()];
  }, [filtered]);
  const tones = (Object.keys(toneNames) as Sentiment[]).map(t => ({ tone: t, count: groups.filter(g => g[0].analysis.sentiment === t).length }));
  const regions = ["National", "North", "South", "East", "West", "Central", "North East", "Global"].map(r => ({ region: r, count: filtered.filter(a => sourceZone(a.region) === r).length }));
  const publisherCount = new Set(filtered.map(a => { const source = state.sources.find(s=>s.id===a.sourceId); return source ? sourcePublisher(source) : a.sourceName; })).size;
  const baselineCount = filtered.filter(a => a.analysis.mode === "baseline").length;
  const collect = async (selection?: string | string[]) => {
    if (busyRef.current || syncRef.current) return;
    const ids = typeof selection === "string" ? [selection] : selection;
    const sources = state.sources.filter(s => s.enabled && (!ids || ids.includes(s.id)));
    if (!sources.length) { toast.error("Enable a source first."); return; }
    busyRef.current = true; stopCollection.current = false; setCollecting(true); let added = 0, failed = 0, cursor = 0, done = 0;
    setCollection({ done: 0, total: sources.length, label: "Starting collection" });
    try {
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (cursor < sources.length && !stopCollection.current) {
          const source = sources[cursor++];
          try { const result = await api<{ run: Run }>("/api/ingest", "POST", { sourceId: source.id }); added += result.run.inserted; if (result.run.status === "error") failed++; }
          catch { failed++; }
          done++; setCollection({ done, total: sources.length, label: source.name });
          if (done % 10 === 0) await refresh();
        }
      }));
      await refresh();
      if (failed) toast.warning(`${added} new records. ${failed} sources need attention. See Collection activity.`);
      else toast.success(`${added} new records added. ${done} sources checked${stopCollection.current ? " before stopping" : ""}.`);
    } finally { setCollecting(false); busyRef.current = false; }
  };
  const toggleSources = async (ids: string[], enabled: boolean) => {
    try { await api("/api/sources/bulk", "PATCH", { ids, enabled }); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update sources."); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setFormError("");
    const field = (key: string) => String(form.get(key) ?? "").trim();
    try {
      if (modal === "company") {
        const data = await api<{ company: Company }>("/api/companies", "POST", { ...(editing ? { id: editing.id } : {}), name: field("name"), domain: field("domain"), industry: field("industry"), aliases: field("aliases").split(",").map(a => a.trim()).filter(Boolean), description: field("description") });
        setModal(null); choose(data.company.id); toast.success(editing ? "Company updated." : "Company added to your watchlist.");
      } else if (modal === "source") {
        await api("/api/sources", "POST", { name: field("name"), url: field("url"), kind: sourceKind, region: sourceRegion, language: sourceLanguage }); setModal(null); await refresh(); toast.success("Source added. Refresh it to check coverage.");
      } else {
        const result = await api<{ warning: string | null }>("/api/import", "POST", { companyId: selected, url: field("url"), title: field("title") || undefined, text: field("text") || undefined, publishedAt: field("publishedAt") || undefined, region: sourceRegion, language: sourceLanguage });
        setModal(null); await refresh(); if (result.warning) toast.warning(result.warning); else toast.success("Article added to the timeline.");
      }
    } catch (e) { setFormError(e instanceof Error ? e.message : "Couldn't save. Please try again."); }
    finally { setSaving(false); }
  };
  const askQuestion = async (event?: FormEvent, suggestion?: string) => {
    event?.preventDefault(); const q = suggestion || question;
    if (q.trim().length < 5 || asking) return;
    setQuestion(q); setAsking(true); setAnswer(null); const id = selected;
    try { const data = await api<Answer>("/api/ask", "POST", { companyId: id, question: q, days: Number(days) }); if (selectedRef.current === id) setAnswer(data); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't retrieve an answer."); }
    finally { setAsking(false); }
  };
  const exportDigest = async () => {
    try {
      const response = await fetch(`/api/export?company=${encodeURIComponent(selected)}`);
      if (!response.ok) throw new Error("Couldn't create the digest.");
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a"); a.href = url; a.download = `${shortName(company).replace(/[^a-z0-9]/gi,"-")}-coverage-digest.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't export."); }
  };
  return <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
    <Navigation state={state} selected={selected} view={view} choose={choose} setView={setView} add={() => openModal("company")} />
    <SidebarInset className="lens-main">
      <header className="topbar"><div className="breadcrumb"><SidebarTrigger className="mobile-menu" /><span>Intelligence</span><ChevronRight size={14} /><strong>{view === "settings" ? "Settings" : nav.find(n => n.id === view)?.title}</strong></div><div className="topbar-right"><ShieldCheck size={16} /><span>Private workspace</span><span className="avatar small">PR</span></div></header>
      <div className="workspace">
        {error && <div role="alert" className="error-banner"><CircleHelp size={18} /><p>{error} The sample company remains available to explore.</p><Button size="sm" variant="outline" onClick={() => { setLoading(true); api("/api/bootstrap", "POST", {}).then(() => refresh()).catch(e => { setError(e.message); setLoading(false); }); }}>Retry</Button></div>}
        <div className="page-heading"><div><p className="eyebrow">{view === "overview" ? "YOUR COMPANY, IN CONTEXT" : "COMPANY INTELLIGENCE"}</p><h1>{view === "overview" ? "Intelligence overview" : view === "ask" ? "Ask Lens" : view === "sources" ? "Source coverage" : view === "activity" ? "Collection activity" : view === "data" ? "Data & imports" : "Workspace settings"}</h1><p className="heading-description">{view === "overview" ? "The latest developments. The evidence behind them." : view === "ask" ? "Ask a question. Follow the answer back to its sources." : view === "sources" ? "A considered mix of regional, national, and global reporting." : view === "activity" ? "See what was collected, skipped, or unavailable." : "Control updates and understand how findings are produced."}</p></div><div className="heading-actions">{view === "sources" ? <Button onClick={() => openModal("source")}><Plus size={16} />Add source</Button> : view === "overview" || view === "ask" ? <Button variant="outline" onClick={exportDigest} disabled={!!error || loading}><ArrowDownToLine size={16} />Export digest</Button> : null}<Button onClick={() => void collect()} disabled={collecting || syncing || !!error || loading}>{collecting ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}<span>{collecting ? "Collecting…" : "Check live sources"}</span></Button></div></div>
        {collecting && <div className="collection-banner" role="status"><div><RefreshCw size={15} className="spin" /><span>Completed: {collection.label}</span><span>{collection.done}/{collection.total} sources</span><Button size="sm" variant="outline" onClick={()=>{stopCollection.current=true;setCollection(c=>({...c,label:"Stopping after current checks…"}));}}>Stop</Button></div><Progress value={collection.total ? collection.done/collection.total*100 : 0} /></div>}
        <div className={`schedule-strip schedule-${state.capabilities.schedule.status}`} role="status"><div><Clock3 size={17}/><strong>{state.capabilities.schedule.mode==="github"?"Collection every 3 hours":state.capabilities.schedule.mode==="server"?"Background collection · every 3 hours":"Browser collection"}</strong><span>{syncing?"Syncing collected coverage…":state.capabilities.schedule.status==="paused"?"Sync paused":state.capabilities.schedule.lastRunAt?`Last run ${prettyDate(state.capabilities.schedule.lastRunAt,true)} IST`:"Awaiting first run"}</span></div><div>{state.capabilities.schedule.failed>0&&<button onClick={()=>setView("sources")}>{state.capabilities.schedule.failed} feeds need attention</button>}{state.capabilities.schedule.mode==="github"&&<Button variant="ghost" size="sm" disabled={syncing||collecting||!!error||!state.capabilities.autoRefresh} onClick={()=>void syncScheduled(true)}>{syncing?<Loader2 size={14} className="spin"/>:<RefreshCw size={14}/>}Sync results{state.capabilities.schedule.pending>0?` (${state.capabilities.schedule.pending})`:""}</Button>}</div></div>
        {state.capabilities.schedule.error&&<div className="error-banner" role="alert"><CircleHelp size={18}/><div><strong>Collection has not finished syncing</strong><p>{state.capabilities.schedule.error}</p><p>Article totals may be incomplete. Use Sync results to retry.</p></div></div>}
        {(view === "overview" || view === "ask") && <><section className="company-strip"><div className={`company-mark ${company.demo ? "aster" : ""}`}>{shortName(company).slice(0,1)}</div><div className="company-identity"><div><h2>{company.name}</h2><span className="industry-tag">{company.industry}</span></div><p>{company.demo ? "Fictional company · sample coverage" : <a href={`https://${company.domain}`} target="_blank" rel="noreferrer">{company.domain}<ArrowUpRight size={12} /></a>}<span>•</span><span>{company.demo ? "India & global" : `${company.aliases.length} name variants monitored`}</span></p></div><div className="company-strip-controls"><Picker value={selected} onChange={choose} label="Choose a company" options={state.companies.map(c => ({ value:c.id,label:shortName(c)+(c.demo ? " (demo)" : "") }))} />{!company.demo && <Button variant="ghost" size="icon" aria-label="Edit company aliases" onClick={() => openModal("company",company)}><Pencil size={15} /></Button>}</div></section>{company.demo && <div className="sample-note"><Layers3 size={15} /><p><strong>Sample workspace.</strong> All Aster Mobility stories, outlets, and analysis are fictional. Select a company from your watchlist for real coverage.</p></div>}</>}
        {view === "overview" && <>
          <section className="stats-grid" aria-label="Coverage statistics">{[
            { label:"Articles in view", value:filtered.length, detail:"Across monitored publications",icon:FileText },
            { label:"Distinct stories", value:groups.length, detail:`${filtered.length-groups.length} repeat${filtered.length-groups.length===1?"":"s"} grouped`,icon:Layers3 },
            { label:"Source outlets", value:publisherCount, detail:"Outlets with matching coverage",icon:Globe2 },
            { label:"Regional articles", value:filtered.filter(a=>a.region!=="India"&&a.region!=="Global").length, detail:"Across Indian regional sources",icon:Languages },
          ].map(s=><article className="stat-card" key={s.label}><div><span>{s.label}</span><s.icon size={18} /></div><strong>{loading ? <Skeleton className="h-9 w-10" /> : s.value}</strong><p>{s.detail}</p></article>)}</section>
          <div className="overview-grid"><div className="main-column">
            <section className="brief-panel"><div className="brief-top"><div><Sparkles size={17} /><span>Coverage brief</span></div><span>{company.demo ? "ILLUSTRATIVE" : state.capabilities.llm ? "SOURCE SUMMARY" : "EXTRACTIVE"}</span></div>{groups.length ? <><h2>{tones.filter(t=>t.count).length>1 ? "A picture with more than one perspective." : "The latest signal in your coverage."}</h2><p>{groups[0][0].analysis.summary}</p><div className="brief-bottom"><span>{groups.length} distinct stories · {new Set(filtered.map(a=>a.language)).size} language{new Set(filtered.map(a=>a.language)).size===1?"":"s"}</span><button onClick={()=>setArticle(groups[0][0])}>Inspect the evidence<ArrowRight size={15} /></button></div></> : <><h2>Your next insight starts with a source.</h2><p>Refresh the monitored feeds or add an accessible article about {company.name}. New coverage will appear here.</p><div className="brief-bottom"><span>Coverage is limited to your selected sources.</span><button onClick={()=>openModal("import")} disabled={company.demo}>Add an article<Plus size={15} /></button></div></>}</section>
            <Tabs defaultValue="timeline" className="coverage-tabs"><TabsList variant="line"><TabsTrigger value="timeline"><Layers3 size={16} />Story timeline<span className="tab-count">{groups.length}</span></TabsTrigger><TabsTrigger value="comparison"><Globe2 size={16} />Regional comparison</TabsTrigger></TabsList>
              <TabsContent value="timeline"><div className="timeline-panel"><div className="timeline-tools"><div className="coverage-search"><Search size={16} /><Input aria-label="Search coverage" placeholder="Search this coverage…" value={search} onChange={e=>setSearch(e.target.value)} /></div><Picker value={tone} onChange={setTone} label="Filter by tone" options={[{value:"all",label:"All tones"},...Object.entries(toneNames).map(([value,label])=>({value,label}))]} /><Picker value={language} onChange={setLanguage} label="Filter by language" options={[{value:"all",label:"All languages"},...Object.entries(langNames).map(([value,label])=>({value,label}))]} /></div>
                {loading ? <div className="timeline-loading" aria-label="Loading coverage">{[1,2,3].map(i=><div key={i}><Skeleton className="h-4 w-40" /><Skeleton className="h-6 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div> : groups.length ? groups.map(g=>{const a=g[0];return <button className="story-row" key={a.clusterId} onClick={()=>setArticle(a)}><span className={`story-icon ${a.analysis.sentiment}`}><FileText size={19} /></span><span className="story-copy"><span className="story-meta"><span>{a.sourceName.replace(" (demo)","")}</span><span>·</span><span>{a.region}</span><span>·</span><span>{a.publishedAt ? prettyDate(a.publishedAt) : "Date unknown"}</span>{a.language!=="en" && <span className="language-tag">{langNames[a.language]||a.language}</span>}</span><strong>{a.analysis.translatedTitle||a.title}</strong><span className="story-excerpt">{a.analysis.summary}</span><span className="story-bottom"><span className="event-tag">{a.analysis.eventType}</span>{g.length>1 && <span className="repeat-label"><Layers3 size={12} />{g.length} related reports</span>}{a.analysis.mode==="baseline" && <span className="baseline-label">Baseline analysis</span>}</span></span><span className="story-end"><Tone value={a.analysis.sentiment} /><ChevronRight size={17} /></span></button>}) : <Empty><EmptyHeader><EmptyMedia variant="icon"><ScanSearch /></EmptyMedia><EmptyTitle>{state.articles.some(a=>a.companyId===selected) ? "No stories match these filters" : "No coverage collected yet"}</EmptyTitle><EmptyDescription>{state.articles.some(a=>a.companyId===selected) ? "Try another term, tone, or language." : "Refresh the feeds or import an article. Only coverage naming this company or its aliases is included."}</EmptyDescription></EmptyHeader>{!company.demo && <Button variant="outline" onClick={()=>openModal("import")}><Plus size={15} />Add an article</Button>}</Empty>}
                <div className="timeline-footer">{(search||tone!=="all"||language!=="all"||days!=="0")&&<Button size="sm" variant="ghost" onClick={()=>{setSearch("");setTone("all");setLanguage("all");setDays("0");}}><X size={13}/>Clear filters</Button>}<span>Latest 1500 stored articles · {filtered.length} in view</span>{!company.demo && <Picker value={days} onChange={setDays} label="Date range" options={[{value:"0",label:"All dates"},{value:"7",label:"Last 7 days"},{value:"30",label:"Last 30 days"},{value:"90",label:"Last 90 days"}]} />}</div></div></TabsContent>
              <TabsContent value="comparison"><section className="comparison-panel"><h3>What each region is covering</h3><p>Differences show gaps in the monitored sample, not proof that a region ignored a story.</p><Table><TableHeader><TableRow><TableHead>Coverage area</TableHead><TableHead>Articles</TableHead>{Object.entries(toneNames).map(([key,label])=><TableHead key={key}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{regions.filter(r=>r.count).map(r=><TableRow key={r.region}><TableCell>{r.region}</TableCell><TableCell>{r.count}</TableCell>{Object.keys(toneNames).map(t=><TableCell key={t}>{filtered.filter(a=>sourceZone(a.region)===r.region&&a.analysis.sentiment===t).length||"—"}</TableCell>)}</TableRow>)}</TableBody></Table>{!filtered.length&&<p>No coverage is available for comparison yet.</p>}<div className="method-note"><CircleHelp size={17}/><p>Counts represent articles, including related reports. Language and region are separate attributes. Regional reporting can be in English.</p></div></section></TabsContent>
            </Tabs>
          </div><aside className="insight-column"><section className="panel sentiment-panel"><div className="panel-title"><h3>Reported tone</h3><span>By story</span></div><div className="sentiment-total"><strong>{groups.length}</strong><span>developments in view</span></div><div className="tone-bar" aria-label="Distribution of reported tone">{tones.map(t=><span key={t.tone} className={`bar-${t.tone}`} style={{width:`${groups.length?t.count/groups.length*100:0}%`}} />)}</div><div className="tone-legend">{tones.map(t=><button key={t.tone} onClick={()=>setTone(tone===t.tone?"all":t.tone)} aria-pressed={tone===t.tone}><span className={`legend-dot bar-${t.tone}`} />{toneNames[t.tone]}<strong>{t.count}</strong></button>)}</div><p className="panel-footnote">Tone describes a reported development. It is not a company rating.{baselineCount>0&&` ${baselineCount} articles use provisional keyword analysis.`}</p></section>
            <section className="panel regional-panel"><div className="panel-title"><h3>Coverage footprint</h3><Globe2 size={17}/></div>{regions.map(r=><div className="region-row" key={r.region}><div><span>{r.region}</span><strong>{r.count}</strong></div><div className="region-track"><span style={{width:`${filtered.length?r.count/filtered.length*100:0}%`}}/></div></div>)}<button className="text-link" onClick={()=>setView("sources")}>Manage your sources<ArrowRight size={14}/></button></section>
            <section className="ask-prompt"><div className="ask-prompt-icon"><MessageSquareText size={20}/></div><h3>Go beyond the headline</h3><p>Explore the evidence behind a development.</p><button onClick={()=>{setView("ask");setQuestion("What are the reported concerns?");}}>Ask about this company<ArrowRight size={15}/></button></section>
            {!company.demo && <Button variant="outline" className="import-button" onClick={()=>openModal("import")}><Plus size={16}/>Add an article or newsletter</Button>}
          </aside></div>
        </>}
        {view==="ask"&&<section className="ask-workspace"><div className="ask-intro"><div className="ask-logo"><Radar size={34}/></div><h2>What would you like to understand?</h2><p>Search {company.name}’s collected coverage. Every answer stays connected to its evidence.</p></div><div className="suggestion-row">{(state.capabilities.llm && !company.demo ? ["What are the reported concerns?","What partnerships were announced?","What do regional sources report?"] : company.demo ? ["Revenue and operating costs","Partnership and pilot agreement","Water use in Tamil Nadu"] : ["Hiring and employees","Partnership agreement","Revenue and profit"]).map(q=><button key={q} onClick={()=>void askQuestion(undefined,q)} disabled={asking}>{q}<ArrowUpRight size={14}/></button>)}</div><form onSubmit={e=>void askQuestion(e)} className="question-form"><label htmlFor="question" className="sr-only">Question about this company</label><Textarea id="question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder={`Ask about ${shortName(company)}…`} minLength={5} maxLength={700} required rows={3}/><div><span><ShieldCheck size={14}/>{state.capabilities.llm&&!company.demo?"Grounded AI answers":"Evidence search · extractive mode"}</span><Button type="submit" disabled={asking||loading||!!error}>{asking?<Loader2 size={16} className="spin"/>:<ArrowRight size={16}/>}{asking?"Reviewing sources…":"Ask Lens"}</Button></div></form>{answer&&<div className="answer-panel" aria-live="polite"><div className="answer-heading"><Sparkles size={19}/><h3>{answer.insufficientEvidence?"More evidence needed":answer.mode==="model"?"Answer from your sources":"Supporting source passages"}</h3><span>{answer.retrieval==="hybrid"?"Hybrid retrieval":"Keyword retrieval"}</span></div><p className="answer-text">{answer.answer}</p>{answer.warning&&<p className="answer-warning">{answer.warning}</p>}<div className="citation-list">{answer.citations.map(c=><article key={c.id}><div><span className="citation-number">{c.id}</span><strong>{c.title}</strong></div><blockquote>{c.quote}</blockquote><div className="citation-source"><span>{c.sourceName}</span>{company.demo?<span>Fictional example</span>:<a href={c.url} target="_blank" rel="noreferrer">Read source<ArrowUpRight size={13}/></a>}</div></article>)}</div></div>}<p className="ask-disclaimer">{company.demo?"Sample answers refer only to the fictional demonstration.":"Retrieval covers the latest 1500 stored articles for this company. AI output can be wrong; inspect supporting passages."}</p></section>}
        {view==="sources"&&<><SourceDirectory sources={state.sources} busy={collecting||syncing||!!error} check={ids=>void collect(ids)} toggle={toggleSources}/><div className="method-note"><BookOpen size={18}/><p>For a newsletter, add its public issue URL or paste an excerpt from the company page. Scheduled collection monitors the built-in catalog. Your source switches control which results enter this workspace.</p></div></>}
        {view==="activity"&&<section className="activity-panel"><div className="panel-title"><h3>Recent collection runs</h3><span>Times in IST</span></div>{state.runs.length?<Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>Scanned</TableHead><TableHead>Matched</TableHead><TableHead>New</TableHead><TableHead>Existing</TableHead></TableRow></TableHeader><TableBody>{state.runs.map(r=><TableRow key={r.id}><TableCell><strong>{state.sources.find(s=>s.id===r.sourceId)?.name||r.sourceId}</strong>{r.error&&<p className="run-detail">{r.error}</p>}</TableCell><TableCell>{prettyDate(r.startedAt,true)}</TableCell><TableCell><span className={`run-status ${r.status}`}>{r.status}</span></TableCell><TableCell>{r.scanned}</TableCell><TableCell>{r.matched}</TableCell><TableCell>{r.inserted}</TableCell><TableCell>{r.duplicates}</TableCell></TableRow>)}</TableBody></Table>:<Empty><EmptyHeader><EmptyMedia variant="icon"><Activity/></EmptyMedia><EmptyTitle>No collection runs yet</EmptyTitle><EmptyDescription>Refresh coverage to check your sources. Every run records results and any access or analysis errors.</EmptyDescription></EmptyHeader><Button onClick={()=>void collect()} disabled={collecting||!!error}><RefreshCw size={16}/>Start first collection</Button></Empty>}<p className="panel-footnote">Matched counts feed items mentioning a watched company. New and existing counts represent company/article records; one item can mention several companies.</p></section>}
        {view==="data"&&<DataWorkspace companies={state.companies} onChanged={refresh}/>}
        {view==="settings"&&<div className="settings-grid"><AISettings onSaved={refresh}/><section className="panel settings-panel"><h3>Collection schedule</h3><div className="setting-row"><div><strong>{state.capabilities.schedule.mode==="github"?"Sync scheduled coverage":"Automatic collection"}</strong><p>{state.capabilities.schedule.mode==="github"?"Collection runs every 3 hours with this page closed. A separate maintenance worker imports encrypted results into the cloud database. Check its heartbeat in Data & imports.":state.capabilities.schedule.mode==="server"?"The running server checks all enabled sources when they are due after 3 hours.":"While this page is open, check one due source every five minutes. Sources become due after 3 hours."}</p></div><Switch checked={state.capabilities.autoRefresh} aria-label="Automatic coverage sync" disabled={!!error} onCheckedChange={async autoRefresh=>{try{await api("/api/settings","PATCH",{autoRefresh});await refresh();toast.success(autoRefresh?"Automatic sync enabled.":"Automatic sync paused.");}catch(e){toast.error(e instanceof Error?e.message:"Couldn't update settings.");}}}/></div><div className="setting-detail"><Clock3 size={17}/><p><strong>{state.capabilities.schedule.mode==="github"?"Runs independently of your browser":"Collection status"}</strong><br/>{state.capabilities.schedule.mode==="github"?`The shared schedule checks ${initialSources.length} catalog sources for the ${initialCompanies.length} built-in companies. Custom companies and sources use live checks here, or the standalone server scheduler. Up to seven days of encrypted runs are available to sync.`:"Keep the standalone server running for unattended checks of your full watchlist."}</p></div>{state.capabilities.schedule.mode==="github"&&<p className="panel-footnote">Pausing sync does not stop collection. Manage the schedule in <a href="https://github.com/Praveenraj1618/company-lens/actions/workflows/collect.yml" target="_blank" rel="noreferrer">GitHub Actions</a>. Scheduled start times can be delayed by GitHub.</p>}<p className="panel-footnote">Last collected: {state.capabilities.schedule.lastRunAt?prettyDate(state.capabilities.schedule.lastRunAt,true)+" IST":"Waiting for first run"}<br/>Last synced: {state.capabilities.schedule.lastSyncedAt?prettyDate(state.capabilities.schedule.lastSyncedAt,true)+" IST":"Not synced yet"}</p>{state.capabilities.schedule.error&&<p className="source-error" role="alert">{state.capabilities.schedule.error}</p>}</section><section className="panel settings-panel"><h3>Analysis & retrieval</h3><div className="setting-row"><div><strong>{state.capabilities.llm?"AI analysis connected":"Baseline mode is active"}</strong><p>{state.capabilities.llm?`Configured model: ${state.capabilities.model}`:"Add a server-side AI key to enable contextual multilingual analysis, translation, embeddings, and synthesized answers."}</p></div><span className={`capability-tag ${state.capabilities.llm?"enabled":""}`}>{state.capabilities.llm?"Connected":"No key"}</span></div><p>Baseline mode uses conservative keyword analysis and returns original source passages. It does not infer stakeholder impacts or translate live articles.</p>{state.capabilities.llm&&<Button variant="outline" disabled={company.demo||saving} onClick={async()=>{setSaving(true);try{const r=await api<{updated:number;remaining:number}>("/api/enrich","POST",{companyId:selected});await refresh();toast.success(`${r.updated} articles enriched; ${r.remaining} remaining.`);}catch(e){toast.error(e instanceof Error?e.message:"Enrichment failed.");}finally{setSaving(false);}}}><Sparkles size={15}/>Enrich 3 stored articles for {shortName(company)}</Button>}</section><section className="panel settings-panel methodology"><h3>How to read this intelligence</h3><div><span>01</span><p><strong>Facts stay linked to the source.</strong> Quotes are checked against the stored original text. This checks provenance, not whether the underlying report is true.</p></div><div><span>02</span><p><strong>Impacts depend on who is affected.</strong> Model analysis separates employees, customers, the business, and local communities. Uncertain effects remain conditional.</p></div><div><span>03</span><p><strong>Repeated reporting is not corroboration.</strong> Similarity-based groups are suggestions. They do not prove shared sourcing or independent confirmation.</p></div><div><span>04</span><p><strong>Coverage has boundaries.</strong> The app monitors selected feeds and accessible pages, keeps publication and collection dates separate, and labels excerpt-based analysis.</p></div></section></div>}
        <footer className="workspace-footer"><span><Radar size={14}/> Company Lens</span><p>Evidence-led company intelligence<span>·</span>India & beyond</p></footer>
      </div>
    </SidebarInset>
    <Dialog open={modal!==null} onOpenChange={open=>{if(!saving&&!open)setModal(null);}}><DialogContent className="lens-dialog"><DialogHeader><DialogTitle>{modal==="company"?(editing?"Edit company":"Add a company"):modal==="source"?"Add a source":"Add an article or newsletter"}</DialogTitle><DialogDescription>{modal==="company"?"Include regional spellings and common aliases to improve matching.":modal==="source"?"Monitor an RSS/Atom feed or an accessible article or newsletter issue.":`Add evidence about ${company.name}. Paste an excerpt when the source cannot be fetched.`}</DialogDescription></DialogHeader><form key={`${modal}-${editing?.id||"new"}`} onSubmit={e=>void submit(e)} className="lens-form">
      {modal==="company"?<><Label htmlFor="company-name">Company name</Label><Input id="company-name" name="name" defaultValue={editing?.name} placeholder="e.g. Freshworks" required minLength={2} maxLength={100}/><div className="form-grid"><div><Label htmlFor="domain">Official website</Label><Input id="domain" name="domain" defaultValue={editing?.domain} placeholder="freshworks.com" required maxLength={250}/></div><div><Label htmlFor="industry">Industry</Label><Input id="industry" name="industry" defaultValue={editing?.industry} placeholder="Software" maxLength={100}/></div></div><Label htmlFor="aliases">Aliases, separated by commas</Label><Textarea id="aliases" name="aliases" defaultValue={editing?.aliases.join(", ")} placeholder="Freshworks Inc., ஃபிரெஷ்வொர்க்ஸ்" rows={2}/><Label htmlFor="description">Notes (optional)</Label><Textarea id="description" name="description" defaultValue={editing?.description} maxLength={500} rows={2}/></>:<>
      {modal==="source"&&<><Label htmlFor="source-name">Source name</Label><Input id="source-name" name="name" placeholder="e.g. Regional Business Weekly" required minLength={2} maxLength={100}/><Label>Source type</Label><Picker value={sourceKind} onChange={setSourceKind} label="Source type" options={[{value:"rss",label:"RSS / Atom feed"},{value:"discovery",label:"Discover a publication’s feed"},{value:"web",label:"Single article / newsletter issue"}]}/></>}
      <Label htmlFor="source-url">{modal==="source"?"Source URL":"Original article URL"}</Label><Input id="source-url" name="url" type="url" placeholder="https://…" required maxLength={2000}/><div className="form-grid"><div><Label>Region</Label><Picker value={sourceRegion} onChange={setSourceRegion} label="Source region" options={REGIONS.map(v=>({value:v,label:v}))}/></div><div><Label>Language</Label><Picker value={sourceLanguage} onChange={setSourceLanguage} label="Source language" options={Object.entries(langNames).map(([value,label])=>({value,label}))}/></div></div>
      {modal==="import"&&<><Label htmlFor="article-title">Title (for pasted text)</Label><Input id="article-title" name="title" maxLength={500} placeholder="Original headline"/><Label htmlFor="article-text">Paste an excerpt (optional)</Label><Textarea id="article-text" name="text" rows={5} maxLength={14000} placeholder="Leave empty to fetch the page. Paste at least 80 characters to import an excerpt."/><Label htmlFor="published-at">Publication date (if known)</Label><Input id="published-at" name="publishedAt" type="date"/></>}
      </>}
      {formError&&<p role="alert" className="form-error">{formError}</p>}<div className="form-actions"><Button type="button" variant="outline" onClick={()=>setModal(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving?<Loader2 size={16} className="spin"/>:<Plus size={16}/>} {saving?"Saving…":modal==="import"?"Collect article":"Save"}</Button></div>
    </form></DialogContent></Dialog>
    <Sheet open={!!article} onOpenChange={open=>{if(!open)setArticle(null);}}><SheetContent className="evidence-sheet">{article&&<><SheetHeader><div className="evidence-eyebrow"><ScanSearch size={16}/>EVIDENCE INSPECTOR</div><SheetTitle>{article.analysis.translatedTitle||article.title}</SheetTitle><SheetDescription>{article.sourceName} · {article.region} · {article.publishedAt?prettyDate(article.publishedAt):"Publication date unknown"}</SheetDescription></SheetHeader><div className="evidence-content"><div className="evidence-tags"><Tone value={article.analysis.sentiment}/><span className="event-tag">{article.analysis.eventType}</span><span className="event-tag">{article.analysis.mode==="demo"?"Fictional example":article.analysis.mode==="model"?"Model analysis":"Keyword baseline"}</span></div><section><h3>Reported development</h3><p>{article.analysis.summary}</p></section><section><h3>Supporting passages</h3>{article.analysis.facts.map((f,i)=><div className="evidence-fact" key={i}><p>{f.claim}</p><blockquote lang={article.language}>{f.quote}</blockquote></div>)}<p className="evidence-meta">Checked against stored source text. This does not independently verify the report.</p></section><section><h3>Who could be affected?</h3>{article.analysis.impacts.length?article.analysis.impacts.map((impact,i)=><div className="impact-row" key={i}><div><strong>{impact.stakeholder}</strong><Tone value={impact.direction}/></div><p>{impact.explanation}</p></div>):<p className="muted">{article.analysis.mode==="baseline"?"Stakeholder interpretation is unavailable in baseline mode. Review the original passage.":"The source does not establish a specific stakeholder impact."}</p>}</section><div className="uncertainty-box"><CircleHelp size={19}/><div><h3>What remains uncertain</h3><p>{article.analysis.uncertainty}</p></div></div><section><h3>Related coverage</h3>{state.articles.filter(a=>a.clusterId===article.clusterId).map(a=><button key={a.id} className="related-source" onClick={()=>setArticle(a)}><FileText size={16}/><span>{a.sourceName}</span>{a.id===article.id?<Check size={15}/>:<ChevronRight size={15}/>}</button>)}<p className="evidence-meta">Grouped by text similarity. Multiple outlets are not necessarily independent sources.</p></section><Tabs defaultValue="original"><TabsList><TabsTrigger value="original">Original text</TabsTrigger>{article.analysis.translatedText&&<TabsTrigger value="translation">English translation</TabsTrigger>}</TabsList><TabsContent value="original"><p className="original-text" lang={article.language} dir={article.language==="ur"?"rtl":"auto"}>{article.text}</p></TabsContent>{article.analysis.translatedText&&<TabsContent value="translation"><p className="original-text">{article.analysis.translatedText}</p></TabsContent>}</Tabs><p className="evidence-meta">Content: {article.contentScope} · Collected {prettyDate(article.fetchedAt,true)}</p>{!article.demo&&<a className="external-source-button" href={article.url} target="_blank" rel="noreferrer">Read original source<ArrowUpRight size={16}/></a>}</div></>}</SheetContent></Sheet>
    <Toaster position="bottom-right" richColors/>
  </SidebarProvider>;
}
