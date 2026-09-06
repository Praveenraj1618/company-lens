# Company Lens

Company intelligence across regional and global news, with cited analysis and a working monitoring dashboard.

Track a company, collect relevant coverage, group repeated reporting, inspect stakeholder implications, and ask questions grounded in the stored sources. English and Tamil sources are included; Hindi source metadata and script detection are supported.

## What works

- Company watchlists with official domains and explicit regional aliases.
- Eight configurable RSS/Atom sources, public page collection, and pasted article/newsletter excerpts.
- Original text, source URLs, publication dates, collection dates and content scope preserved separately.
- Idempotent collection, conservative related-story grouping, source health and run history.
- Event categorization and positive/negative/mixed/unclear development tone.
- Optional structured AI analysis with exact-quote validation, translations and stakeholder-specific implications.
- BM25 retrieval plus optional embeddings and reciprocal-rank fusion; cited answers or original excerpts on fallback.
- Timeline search and filters, regional topic comparison, evidence inspector and Markdown digests.
- Durable D1 or SQLite storage, a standalone background collector, optional Worker cron and GitHub scheduling.
- Production build, API and runtime tests, a small reproducible retrieval fixture, and CI.

**Model key optional:** without one, the app still collects sources and offers labelled keyword analysis and extractive search. Contextual analysis, live translation, embeddings and synthesized answers require your own server-side API key. The fictional Aster Mobility demonstration is clearly labelled and stays separate from real company data.

## Run locally

Use **Node 24** and Bash (Git Bash on Windows). No Python, GPU or external database is needed for this implementation.

```bash
git clone https://github.com/Praveenraj1618/company-lens.git
cd company-lens
npm ci
cp .env.example .dev.vars
npm run build
npm run start:standalone
```

Open `http://127.0.0.1:3000`. Data is stored in `.data/company-lens.sqlite`. The background collector runs while the process stays running when `SCHEDULE_ENABLED=true`. Configure a model key in `.dev.vars` when you want AI enrichment. Never commit that file.

[Complete setup and operations](docs/operations.md) · [Architecture and limits](docs/architecture.md) · [Evaluation and verification](docs/evaluation.md)

## Delivery stages

| Stage | Scope |
|---|---|
| 1 — Foundation | Application shell, typed contracts, durable schema and configuration |
| 2 — Intelligence engine | Collection, entity matching, deduplication, analysis, embeddings, RAG and API tests |
| 3 — Workspace | Dashboard, source controls, company forms, regional comparison and evidence inspection |
| 4 — Release | Standalone runtime, scheduler, Docker recipe, CI, evaluation and operating documentation |

The Git history records each stage separately. The project is implemented in TypeScript with React/Vinext, Cloudflare Workers, SQLite/D1, Zod and fast-xml-parser. It integrates pretrained models through an API; it does not train a new ML model.

## Verify

```bash
npm run typecheck
npm run test:core
npm run evaluate
npm run build
npm run test:release
```

The evaluation uses 18 hand-authored questions over fictional stories. It is a smoke fixture, not a claim of real-world model accuracy. Live model calls, publisher availability and Docker execution have separate limits recorded in the evaluation guide.

## Important boundaries

Coverage is limited to monitored, accessible sources. Robots/access restrictions are respected. Reports are not treated as verified facts, source count is not independent corroboration, and tone is not a corporate reputation or investment score. Alias disambiguation and story grouping are conservative heuristics that can miss or misclassify cases.

The first version supports one private workspace, up to 25 companies and 20 sources, and the latest 300 stored articles per company in retrieval/display/export. A private Sites preview can refresh only while its browser tab is open. For collection with the browser closed, run the standalone app/Docker on an always-on machine or configure a supported external scheduler.
