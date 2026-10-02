# MindMesh

A local workspace for organizing projects and inspecting CSV/XLSX datasets. Built with React, TypeScript, Vite, Tailwind CSS, FastAPI, and SQLite.

The workspace starts empty. Create a project, upload a dataset, preview its columns and rows, and assign it to a project. Registration, sign-in, and account settings now use the local API. Workspace records and uploads still use browser storage while the account-owned workspace API is being connected. Files are parsed in the browser and are not yet sent to the server.

## Run locally

Requires Node.js 22.12 or newer and Python 3.11 or newer. In PowerShell, start the API in one terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The SQLite database and future uploads are kept under the ignored `var/` directory. See `backend/.env.example` for optional local configuration. In another terminal, start the frontend:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to the local backend so the browser uses one origin. Stop each server with Ctrl+C.

On the original Windows workspace, Node.js is available in `.local`. PowerShell can use its `npm.cmd` launcher without changing the script execution policy:

```powershell
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd run dev
```

To open the app on a phone connected to the same Wi-Fi, start Vite with `npm.cmd run dev -- --host 0.0.0.0`, then open `http://<computer-wifi-ip>:5173` on the phone. Keep the terminal running.

## Features

- Create and delete projects. Deleting a project leaves its datasets in the workspace, unassigned.
- Import CSV or XLSX files, including a selected worksheet from a multi-sheet workbook.
- Inspect inferred column types, missing values, row counts, and up to 10 preview rows.
- Assign datasets to projects or remove them from the browser workspace.
- Change the display name or reset the workspace to empty.

Imports use a Web Worker with a 20-second timeout. Limits are 5 MB per file, 20,000 data rows, and 100 columns. CSV files must use UTF-8, with non-empty unique headers and consistent row widths.

`localStorage` stores project details, dataset summaries, and up to 25 preview rows per dataset under `mindmesh.workspace.v1`. Full uploaded files are not retained. Existing version 1 workspaces are migrated on load: custom projects and uploaded datasets are kept, while seeded projects, synthetic datasets, demo models, and sample chat are removed. Data belongs to this browser and origin; changing hostname or port creates a separate workspace.

## Verify

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Run the build before browser tests. In the original Windows workspace, set `$env:PLAYWRIGHT_BROWSERS_PATH = "$(Get-Location)\.local\browsers"` before `npm.cmd run test:e2e` to reuse the installed browser.
