# Company Lens

A company intelligence workspace for regional and global news, evidence-backed event analysis, and cited question answering.

## Delivery stages

1. Foundation: application shell, durable schema, data contracts and configuration.
2. Intelligence engine: safe source retrieval, company matching, deduplication, event analysis and hybrid RAG.
3. Workspace: watchlists, source management, timeline, evidence inspection and digests.
4. Release: integration tests, evaluation fixtures, automation, deployment and operational documentation.

## Scope

Monitors selected RSS/Atom feeds and public pages. Coverage is bounded to monitored sources; it cannot promise all news about an organization. Company aliases are explicit and editable. Repeated coverage is grouped, not counted as independent confirmation. Facts, tone, and stakeholder implications remain separate.

The included fictional demonstration is labelled throughout. Live ingestion never mixes demonstration articles into real company coverage. API keys stay on the server. Without a model key, a conservative baseline and extractive answers remain available and are labelled as such.

Built with TypeScript, React, Vinext, Cloudflare Workers and D1. Full setup, evaluation, and deployment instructions are added in the release stage.
