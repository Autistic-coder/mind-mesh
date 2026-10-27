# Release verification — 27 October 2026

## Database portability update

This update stores complete dataset/model bytes in standard PostgreSQL, uses disposable private
file caches, and prepares Vercel + Render Free deployment with a Neon connection. Checks on the
Windows workspace: 36 backend tests passed (3 PostgreSQL-only tests skipped), 15 frontend tests passed,
17 Chromium browser tests passed, and TypeScript/Vite build, ESLint, Prettier, Ruff lint/format,
and Render Blueprint JSON-schema validation passed. The Render CLI is not installed; schema
validation is not a Render deployment test.

New tests cover empty-cache training/download/prediction recovery across application sessions,
cross-account and anonymous denial before cache hydration, lazy binary loading, cascade deletion,
provider-copy dry run, verified file bytes, occupied destination refusal, and rollback on missing
legacy files. Copy tests use disposable SQLite fixtures; a real provider-to-provider PostgreSQL
copy remains unverified until a destination connection is supplied.

The existing database connection has intentionally not been switched or deleted. Live Neon
cutover and hosted HTTPS verification are pending the destination connection, the user's Render
workspace choice, and manual Git push. No paid resources or live LLM calls were created. The
previous release results below are historical and describe the old hosting provider.

## Previous release

Checks run on the existing Windows PowerShell workspace before this update:

| Check                                    | Result                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| Backend pytest suite                     | 33 passed, 3 PostgreSQL-only tests skipped                      |
| Frontend Vitest                          | 15 passed                                                       |
| Real Chromium end-to-end suite           | 17 passed                                                       |
| TypeScript and Vite production build     | Passed                                                          |
| ESLint and Prettier                      | Passed                                                          |
| Ruff lint and formatting                 | Passed                                                          |
| Windows backend/frontend startup scripts | Both launched; frontend and proxied readiness returned HTTP 200 |
| Live Supabase runtime query              | Connected; current schema `mindmesh`, revision `e421bfd675ae`   |
| Live Supabase private schema permissions | 12 tables; `anon` and `authenticated` schema usage both false   |

Browser checks cover registration, protected navigation, sign-out/account switching, destination
restoration, empty states, project creation/editing, CSV/XLSX review and upload, worksheet choice,
refresh persistence, errors/retry/cancel, legacy import/export isolation, real classification and
regression fitting, results, saved model inspection/deletion, single prediction, batch download,
rate-limit recovery, assistant setup help, keyboard flow, and mobile overflow/layout checks.

Backend tests exercise exact cross-account resource IDs, forgery, CSRF/origin rejection, Argon2id
hashes, session expiry/logout, upload/download ownership, file cleanup on failed commits, restart
access to stored models, queue capacity, invalid inputs, training metrics, CSV export escaping,
infinite numeric rejection, database outage sanitization, proxy trust, assistant context ownership,
consent, persistence, and provider failure behavior. Provider responses in tests are explicitly mocked.

## Practical limits and unverified external operations

- No disposable PostgreSQL test database was configured. The three destructive PostgreSQL migration,
  concurrency, and SQLite import tests were skipped. The live Supabase checks were read-only; no
  production records were removed or reset for tests. SQLite fixtures exercise application behavior
  but do not establish all PostgreSQL concurrency semantics.
- Supabase was initially unreachable, then became available after the project was active. Final live
  connection and schema checks passed. A GitHub Supabase Preview check on an intermediate commit
  timed out; a later preview check succeeded. These service checks are separate from local tests.
- No `OPENAI_API_KEY` was configured. The real SDK integration, bounded request options, static setup
  state, privacy boundaries, and mocked success/failure paths are implemented/tested; no live model
  answer, billing, quota, or model entitlement was verified.
- Docker is not installed here. The Docker/Compose deployment is prepared and documented, and the
  same built frontend routing is tested through FastAPI. A container image build, public HTTPS,
  reverse proxy, VM resource capacity, and production deployment were not exercised. Nothing was
  provisioned or published.
- Only one API process/replica and one training thread are supported. Jobs are interrupted on restart;
  they are not retried automatically. The queue is limited to four active/pending runs. See deployment
  guidance for database-outage recovery and persistent file backups.
- Artifact loading requires the same scikit-learn version. Dependency updates can require retraining.
  Do not load arbitrary uploaded model binaries. No guarantee of universal performance or bug-free
  operation is made.

## Repeat the checks

From the repository root, with dependencies installed:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
.\.venv\Scripts\python.exe -m ruff check backend
.\.venv\Scripts\python.exe -m ruff format --check backend
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH = "$(Get-Location)\.local\browsers"
npm.cmd run test:e2e
```

Set `MINDMESH_TEST_POSTGRES_URL` only to a separate disposable database if you want to include the
destructive PostgreSQL checks. The fixture rejects an exact match with the application URL, but two
different role/host URLs can still reach the same database: the operator must ensure actual isolation.
Browser tests use a fresh temporary SQLite database and disable provider calls to avoid spending.
