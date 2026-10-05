# MindMesh

MindMesh is a private workspace for organizing projects, inspecting CSV/XLSX datasets, and training
measured tabular models. It uses React, TypeScript, Vite, FastAPI, SQLAlchemy, Supabase PostgreSQL,
and scikit-learn.

Create an account, upload a dataset, choose a classification or regression task, compare real
models on held-out rows, and reuse a saved pipeline for single or batch predictions. Accounts and
workspace records persist in PostgreSQL. Original datasets and fitted model files remain in private
server directories and are served only through ownership-checked API endpoints.

## Run locally

Requirements:

- Node.js 22.12 or newer
- Python 3.11 or newer
- A Supabase PostgreSQL project

Copy `backend/.env.example` to `.env`. In Supabase Dashboard, open **Connect** and copy the exact
direct connection or Session pooler URI into `MINDMESH_DATABASE_URL`. Keep the URI only in `.env`.
Use the Session pooler when the machine cannot connect over IPv6. Do not use a transaction pooler
for migrations.

Start the API in the first PowerShell terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Start the frontend in a second terminal:

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to the backend, so browser cookies and CSRF
requests remain on one origin. Stop either process with Ctrl+C.

This repository includes a local Node.js installation for its original Windows workspace. Use it
when `npm` is not on `PATH`:

```powershell
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd run dev
```

See [Supabase setup and SQLite cutover](docs/supabase.md) before moving existing local records.

## What is stored where

- Supabase PostgreSQL stores users, opaque session hashes, projects, dataset metadata, training
  configurations and runs, model metadata, prediction history, conversations, and shared rate
  limits in the private `mindmesh` schema.
- `var/uploads` stores complete uploaded datasets under server-generated names.
- `var/models` stores fitted joblib pipelines under server-generated names.
- The browser never receives a database password and never connects to Supabase directly.

The `mindmesh` schema is outside Supabase's default Data API exposure. Migrations revoke access from
`PUBLIC`, `anon`, and `authenticated`; the FastAPI server remains the authorization boundary. Every
private query also constrains records by the account ID derived from its server session.

Older browser-only workspaces stay untouched in `localStorage` under `mindmesh.workspace.v1`. In
**Workspace settings → Older browser workspace**, the signed-in user may explicitly review and
import a copy or export the original JSON. MindMesh never silently attaches this data to an account.

## Model workflow

- Create projects and privately upload CSV or XLSX files.
- Review a bounded preview before saving the complete file.
- Choose the answer column, usable input columns, model type, and held-out split in the six-step
  Model Lab wizard.
- Train logistic regression, random forest classification, ridge regression, or random forest
  regression with preparation fitted only on training rows.
- Compare held-out metrics, choose a persisted model, and make single or batch CSV predictions.
- Load either synthetic sample as an independent account-owned copy.

Dataset limits and recovery behavior are documented in [Dataset workflow](docs/dataset-workflow.md).
The [teacher demo guide](docs/demo-guide.md) covers the presentation flow and example inputs.

## Verify

Frontend checks:

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Backend checks:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
.\.venv\Scripts\python.exe -m ruff check backend
.\.venv\Scripts\python.exe -m ruff format --check backend
```

Set `MINDMESH_TEST_POSTGRES_URL` to a disposable PostgreSQL database before the backend test command
to include destructive PostgreSQL migration and concurrency checks. Without it, those tests are
reported as skipped rather than being simulated with SQLite.

MindMesh does not include Supabase Auth, Supabase Storage, direct browser database access, an LLM,
hyperparameter search, causal analysis, deployment, or production model monitoring.
