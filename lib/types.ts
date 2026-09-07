export type Sentiment = "positive" | "negative" | "mixed" | "unclear";
export type Region = typeof import("./catalog.ts").REGIONS[number];
export type AnalysisMode = "model" | "baseline" | "demo";
export interface Company {
  id: string; name: string; domain: string; industry: string;
  aliases: string[]; description: string; demo: boolean; createdAt: string;
}
export interface Source {
  id: string; name: string; url: string; kind: "rss" | "web";
  region: Region; language: string; enabled: boolean;
  status: "unfetched" | "healthy" | "error";
  lastFetchedAt: string | null; error: string | null;
}
export interface Evidence { quote: string; claim: string }
export interface Analysis {
  eventType: string; sentiment: Sentiment; summary: string; facts: Evidence[];
  impacts: { stakeholder: string; direction: Sentiment; explanation: string }[];
  uncertainty: string; mode: AnalysisMode; model: string | null;
  translatedTitle: string | null; translatedText: string | null;
}
export interface Article {
  id: string; companyId: string; sourceId: string; sourceName: string;
  title: string; url: string; text: string; publishedAt: string | null;
  fetchedAt: string; language: string; region: Region;
  contentHash: string; clusterId: string; analysis: Analysis;
  embedding: number[] | null; embeddingModel: string | null;
  contentScope: "feed-excerpt" | "article" | "manual" | "demo"; demo: boolean;
}
export interface Run {
  id: string; companyId: string | null; sourceId: string; startedAt: string;
  finishedAt: string | null; status: "running" | "success" | "partial" | "error";
  scanned: number; matched: number; inserted: number; duplicates: number; error: string | null;
}
export interface CollectionSchedule {
  mode: "github" | "server" | "browser"; intervalHours: 3; status: "waiting" | "current" | "delayed" | "paused" | "error";
  lastRunAt: string | null; lastSyncedAt: string | null; nextRunAt: string | null; healthy: number; failed: number; pending: number; error: string | null;
}
export interface AppState {
  companies: Company[]; sources: Source[]; articles: Article[]; runs: Run[];
  capabilities: { llm: boolean; embeddings: boolean; model: string; autoRefresh: boolean; lastScheduledAt: string | null; schedule: CollectionSchedule };
}
export interface Citation { id: string; title: string; url: string; quote: string; sourceName: string }
export interface Answer {
  answer: string; citations: Citation[]; mode: "model" | "extractive";
  retrieval: "hybrid" | "lexical"; insufficientEvidence: boolean; warning?: string;
}
