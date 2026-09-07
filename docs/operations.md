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

Choose a real company, edit aliases if needed, then check live sources or sync scheduled coverage. To try a controlled example without relying on a feed, use Add an article and paste an accessible excerpt that names the selected company. The original HTTPS URL is required for provenance.

All Aster Mobility data is a fictional demonstration, including its source outlets and prewritten Tamil translation. Real watchlist companies start without seeded news; scheduled sync or live checks populate their timelines. Collecting feeds updates real companies, never the demonstration.

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

### Existing private Site

The deployed project uses the `Scheduled company coverage` GitHub Actions workflow. Its UTC cron is `17 */3 * * *`. It also runs on relevant catalog/collector pushes and supports manual **Run workflow** in GitHub.

The runner checks the 115 public catalog feeds against the 20 public built-in companies. It encrypts results using `config/collector-public-key.json`, then publishes ciphertext and a timestamp/hash manifest to the separate `coverage-data` branch. The workflow's repository-scoped `GITHUB_TOKEN` has `contents: write` for this publication. It never receives the private Site key or user database.

The private Site has server environment values `COVERAGE_REPOSITORY=Praveenraj1618/company-lens` and a secret `COVERAGE_PRIVATE_KEY` containing the RSA private JWK. It decrypts and imports results only after an authenticated visit. **Sync results** resumes pending work. Source switches control which records enter the workspace. Pausing automatic sync does not stop the GitHub job; disable the workflow in GitHub to pause unattended collection.

The active manifest retains 56 runs (approximately seven days). Returning after that window can miss expired coverage; old ciphertext can remain in Git history. Source `main`, user-added companies, manual excerpts, questions and private settings are not written by the scheduled publisher.

A custom company or source added inside the private app is not silently exported to GitHub. It uses live checks/browser collection, or the standalone scheduler described below. To schedule a new public catalog entry on GitHub, edit `lib/catalog.ts` / `lib/source-catalog.json` and push it.

### Standalone Node / Docker

With `SCHEDULE_ENABLED=true`, the running process checks due sources at startup and every five minutes. **All enabled sources become due after three hours**, and a cycle processes them with at most three concurrent tasks, serialized per hostname. A persisted source timestamp prevents repeated checks inside that interval. Pausing automatic collection or individual sources is respected.

Closing the browser does not stop this collector. Stopping the process, sleeping the laptop or losing internet access does. Use an always-on host for continuous operation. This route handles custom workspace companies and sources, unlike the fixed public GitHub catalog.

A separately deployed Worker can use the exported `scheduled` handler with its own Cron Trigger. The Sites deployment does not configure a native Cron Trigger; GitHub performs unattended collection for that Site. A self-hosted HTTPS service can also use the optional `scripts/trigger-collection.mjs` bearer-token helper with `COMPANY_LENS_URL` and `CRON_SECRET`. It cannot call through the private Sites browser sign-in gate.

GitHub schedules can run late and inactive schedules can be disabled. Inspect [workflow runs](https://github.com/Praveenraj1618/company-lens/actions/workflows/collect.yml) and the dashboard's last-run time. See the official [GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [Worker Cron Trigger documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

### Key handling for a new installation

The committed public key belongs to this private Site. A fork cannot decrypt its snapshots. For a separate installation, generate a new key pair and configure that installation's server secret. `scripts/generate-collector-key.mjs` refuses to overwrite an existing key deliberately. Back up the private key securely before any rotation; retained snapshots need their original key. Never put private key JSON in Git, client code or workflow logs.

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
| PATCH | `/api/settings` | Configure automatic sync / standalone collection |
| POST | `/api/tick` | Browser-driven collection of one due source |
| POST | `/api/cron` | Machine-authenticated cycle over all due sources |
| POST | `/api/sync` | Verify, decrypt and resume importing a scheduled snapshot |
| PATCH | `/api/sources/bulk` | Enable or pause a filtered group of sources |
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
