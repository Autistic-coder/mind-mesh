# MindMesh

MindMesh is a private workspace for organizing projects, inspecting CSV/XLSX datasets, and training
measured tabular models. It uses React, TypeScript, Vite, FastAPI, SQLAlchemy, standard PostgreSQL,
and scikit-learn.

Create an account, upload a dataset, choose a classification or regression task, compare real
models on held-out rows, and reuse a saved pipeline for single or batch predictions. Accounts and
workspace records, complete original datasets, and fitted models persist in PostgreSQL. Private
server directories cache files for parsing and inference; ownership-checked endpoints control access.

## Run locally

Requirements:

- Node.js 22.12 or newer
- Python 3.11 or newer
- A PostgreSQL database (for example Neon Free)

Copy `backend/.env.example` to `.env` and put your direct PostgreSQL connection URI in
`MINDMESH_DATABASE_URL`. In Neon, disable connection pooling in **Connect**. Keep the URI only in
`.env`; do not use a transaction pooler because the app uses a private session search path.

One-time Python setup from `C:\Users\Vaibhav\Desktop\ai ml\ai ml project`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
```

One-time frontend setup (the local Node path is optional if Node is installed globally):

```powershell
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd ci
```

Start the backend whenever needed (terminal 1, repository root):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

Start the frontend (terminal 2, same repository root):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to the backend, so browser cookies and CSRF
requests remain on one origin. Stop either process with Ctrl+C.

This repository includes a local Node.js installation for its original Windows workspace. Use it
when `npm` is not on `PATH`:

```powershell
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd run dev
```

See [Database setup and safe provider migration](docs/database.md) before changing an existing
connection. Preserve the old connection and files until the copy is verified.

## What is stored where

- PostgreSQL stores users, opaque session hashes, projects, dataset metadata, training
  configurations and runs, model metadata, prediction history, conversations, and shared rate
  limits in the private `mindmesh` schema.
- Complete uploads and trained model bytes live on their owning database rows, with lazy loading.
- `var/uploads` and `var/models` cache private files under server-generated names. New records can
  recover those files after cache loss; older filesystem-only records need the migration first.
- The browser never receives a database password or connects directly to PostgreSQL.

The private `mindmesh` schema is accessed only through the backend. Migrations revoke public
access; the FastAPI server remains the authorization boundary. Every
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

Ask MindMesh uses a real OpenAI Responses API integration when `OPENAI_API_KEY` is configured on
the server. Without a key, the page honestly shows static help. Optional context is previewed,
explicitly shared, and resolved with server ownership checks; rows, files, and account details are
excluded. Conversations can be reopened or deleted privately.

See [Beginner guide](docs/beginner-guide.md), [Teacher demo](docs/demo-guide.md),
[Deployment](docs/deployment.md), and [Release verification](docs/release-verification.md).
The free demo deployment uses [Vercel, Render Free, and Neon](docs/vercel-render.md). A Docker
deployment behind HTTPS remains available. Both local development services must run. Deployment
configuration alone does not publish a working application.

MindMesh does not depend on provider authentication, object storage, or browser database access. Training
supports one API process and one training thread; production monitoring and distributed workers are
outside this deployment.
