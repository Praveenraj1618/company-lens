import type { ModelConfig } from "./provider.ts";
export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]> }
export interface RuntimeEnv extends ModelConfig {
  SITES_SERVICE_TOKEN?: string; CREDENTIAL_ENCRYPTION_KEY?: string;
  COVERAGE_PRIVATE_KEY?: string; COVERAGE_REPOSITORY?: string; SCHEDULE_ENABLED?: string;
  DB: Database; ASSETS?: { fetch(request: Request): Promise<Response> };
  ALLOW_LOCAL_DEV?: string; CRON_SECRET?: string;
  TRUST_SITES_AUTH?: string; DASHBOARD_PASSWORD?: string;
}
