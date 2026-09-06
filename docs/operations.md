# Running and operating Company Lens

## Local Node setup

Use Node 24 and a Bash-capable terminal. On Windows, Git Bash works with the repository's build scripts. Node 24 is needed for native TypeScript execution and the SQLite standalone adapter.

```bash
git clone https://github.com/Praveenraj1618/company-lens.git
cd company-lens
npm ci
cp .env.example .dev.vars
npm run build
npm run start:standalone
```

Open `http://127.0.0.1:3000`. The server initializes the SQLite database and seed watchlist. It binds only to loopback by default. A model key is optional for startup.

Choose a real company, edit aliases if needed, then refresh coverage. To try a controlled example without relying on a feed, use Add an article and paste an accessible excerpt that names the selected company. The original HTTPS URL is required for provenance.

All Aster Mobility data is a fictional demonstration, including its source outlets and prewritten Tamil translation. Real watchlist companies start with zero articles. Collecting feeds updates real companies, never the demonstration.

## Model configuration

Set values in ignored `.dev.vars`, or the hosting environment:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
SCHEDULE_ENABLED=true
```

Add your own key value locally and restart the server. Do not commit it. The browser receives capability flags, never the key. Hosted private Sites runtime values must be set through its environment settings, not a Git commit.

Without the key, collection, persistence, filtering, keyword analysis, extractive search and exports work. Contextual interpretation, live translation, embeddings and synthesized answers require a working model account. Invalid/unavailable model responses fall back visibly. Configuring a key enables metered provider requests during collection and question answering.

After adding or changing the key/model, choose a real company and use Settings → Enrich stored articles. Each request processes at most three articles. Repeat until remaining reaches zero. A different embedding model requires regenerated vectors; incompatible stored vectors are excluded from hybrid retrieval.

## Docker

Copy `.env.example` to `.dev.vars`. Set a strong `DASHBOARD_PASSWORD` of at least 16 characters; Docker binds inside its container to a non-loopback interface. The host port is still restricted to `127.0.0.1` in the supplied Compose file.

```bash
docker compose up --build -d
docker compose logs -f company-lens
```

Open `http://127.0.0.1:3000`. The HTTP authentication prompt accepts any username and the configured password. For remote access, put the service behind an HTTPS reverse proxy; never expose password authentication over plain HTTP. The named volume stores the SQLite database. Keep that volume to preserve data.

The Docker image is provided as a deployment recipe. The Node runtime is covered by release tests; the image itself has not been built in the authoring environment.

## Scheduling and uptime

The Node/Docker collector runs when `SCHEDULE_ENABLED=true`. It checks one source at startup and every five minutes, choosing only sources not fetched in the last 24 hours. With eight sources, the initial rotation takes up to about 40 minutes. Manual Refresh coverage checks all enabled sources immediately. Pause an individual source with its switch.

Closing a browser does not stop the Node/Docker collector. Stopping the process, sleeping the laptop, or losing internet access does. Use an always-on host for unattended monitoring.

The private Sites preview provides optional refresh while its tab is open. It does not provision an always-on timer. For a standalone Worker, configure its `scheduled` handler with a Cron Trigger. Alternatively configure the included GitHub workflow with:

- Repository variable `COMPANY_LENS_URL`: your reachable standalone HTTPS app origin.
- Repository secret `CRON_SECRET`: a random token of at least 32 bytes, also stored in the application's environment.

Leave the variable empty to keep the GitHub schedule inactive. The workflow refuses redirects so a token is not forwarded to another host. It cannot use an owner-private Sites preview URL because the platform requires browser sign-in. GitHub schedules may run late; do not use them for guaranteed delivery times.

See the official [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [Worker Cron Trigger documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Source failures

| Symptom | Action |
|---|---|
| HTTP 403, 401, browser verification or robots restriction | Keep the restriction. Use another permitted source or paste an excerpt you may use. |
| Source timeout / unresolved DNS | Check outbound HTTPS access to the source and `cloudflare-dns.com`; inspect the collection log. |
| Feed URL returns HTML | Choose Public page or obtain the publisher's actual RSS/Atom URL. |
| Zero company matches | Review aliases, languages and whether the current feed actually mentions the company. |
| Run limit reached | A later run will consider remaining uncollected items still in the feed. |
| AI / embedding provider error | Check the server key/model/account; the stored baseline remains usable. |
| Cross-language question finds no evidence | Enable embeddings/translation, enrich stored content, or search using terms in the original language. |
| Database migration hash changed | Restore the applied migration and create a new migration; do not rewrite applied history. |

Some feeds stop publishing, change paths, or alter access policy. A successful parser fixture test does not prove a publisher is currently reachable. Source status is based on a real fetch, never pre-seeded as healthy.

## Backup

Stop the standalone server before copying the `.data` directory, or use SQLite's supported online backup mechanism. For Docker, back up the named data volume consistently. Do not commit collected article text or database files to the public repository.

## API

All application endpoints require workspace/standalone authentication, except the minimal `/api/health`. Browser writes require same-origin JSON. `/api/cron` uses its separate bearer token.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/bootstrap` | Idempotent initial watchlist/source setup |
| GET | `/api/state?company=...` | Company, sources, latest articles, history and capability flags |
| POST | `/api/companies` | Add or update a company and aliases |
| POST / PATCH | `/api/sources` | Add a source or change its enabled state |
| POST | `/api/ingest` | Collect one source for all watched companies |
| POST | `/api/import` | Fetch an article or import a pasted excerpt |
| POST | `/api/ask` | Retrieve evidence and optionally synthesize a cited answer |
| POST | `/api/enrich` | Model analysis/embeddings for up to three stored articles |
| PATCH | `/api/settings` | Configure browser refresh |
| POST | `/api/tick` | Browser-driven collection of one due source |
| POST | `/api/cron` | Machine-authenticated collection of one due source |
| GET | `/api/export?company=...` | Markdown coverage digest |

## Verification commands

```bash
npm run typecheck
npm run test:core
npm run evaluate
npm run build
npm run test:release
```

The GitHub CI workflow runs the same sequence on Node 24. Build before release tests; they exercise the compiled Worker and standalone HTTP runtime. Unit tests use fixtures and mocked model/source responses without paid API calls. The evaluation report is a small synthetic retrieval check, not evidence of general model accuracy.
