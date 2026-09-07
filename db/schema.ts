import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(), name: text("name").notNull(), domain: text("domain").notNull(),
  industry: text("industry").notNull(), aliases: text("aliases").notNull(), description: text("description").notNull(),
  demo: integer("demo").notNull().default(0), createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("idx_companies_domain").on(t.domain)]);
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(), name: text("name").notNull(), url: text("url").notNull(),
  kind: text("kind").notNull(), region: text("region").notNull(), language: text("language").notNull(),
  enabled: integer("enabled").notNull().default(1), status: text("status").notNull().default("unfetched"),
  lastFetchedAt: text("last_fetched_at"), error: text("error"),
}, t => [uniqueIndex("idx_sources_url").on(t.url)]);
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(), companyId: text("company_id").notNull().references(() => companies.id),
  sourceId: text("source_id").notNull(), sourceName: text("source_name").notNull(),
  title: text("title").notNull(), url: text("url").notNull(), text: text("text").notNull(),
  publishedAt: text("published_at"), fetchedAt: text("fetched_at").notNull(),
  language: text("language").notNull(), region: text("region").notNull(),
  contentHash: text("content_hash").notNull(), clusterId: text("cluster_id").notNull(),
  analysis: text("analysis").notNull(), embedding: text("embedding"), embeddingModel: text("embedding_model"),
  contentScope: text("content_scope").notNull(), demo: integer("demo").notNull().default(0),
}, t => [uniqueIndex("idx_articles_company_url").on(t.companyId, t.url),
  index("idx_articles_company_date").on(t.companyId, t.publishedAt),
  index("idx_articles_company_hash").on(t.companyId, t.contentHash)]);
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(), companyId: text("company_id"), sourceId: text("source_id").notNull(),
  startedAt: text("started_at").notNull(), finishedAt: text("finished_at"), status: text("status").notNull(),
  scanned: integer("scanned").notNull().default(0), matched: integer("matched").notNull().default(0),
  inserted: integer("inserted").notNull().default(0), duplicates: integer("duplicates").notNull().default(0), error: text("error"),
}, t => [index("idx_runs_started_at").on(t.startedAt)]);
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value").notNull() });
export const leases = sqliteTable("leases", { key: text("key").primaryKey(), expiresAt: integer("expires_at").notNull() });
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), companyId: text("company_id").notNull().references(() => companies.id),
  status: text("status").notNull(), data: text("data").notNull(), error: text("error"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("idx_jobs_queue").on(t.kind, t.status, t.updatedAt)]);
