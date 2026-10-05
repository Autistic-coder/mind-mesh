# MindMesh

A local workspace for organizing projects, inspecting CSV/XLSX datasets, and training measured tabular models. Built with React, TypeScript, Vite, Tailwind CSS, FastAPI, SQLite, and scikit-learn.

Create an account, upload a dataset, configure a classification or regression task, train real models, inspect hel newer and Python 3.11 or newer. In PowerShell, start the API in one terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

The SQLite database, uploads, and fitted model artifacts are kept under the ignored `var/` directory. See `backend/.env.example` for optional local configuration. In another terminal, start the frontend:

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

that URL on the phone. Keep both terminals running.

## Features#####ydfugieurghfisu

- Create and delete projects. Deleting a project leaves its datasets in the workspace, unassigned.
- Import CSV or XLSX files, including a selected worksheet from a multi-sheet workbook.
- Review a bounded preview before saving, then inspect inferred column types, missing values, row
  counts, file metadata, and the saved preview.
- Assign datasets to projects, download their original files, or remove them from the account workspace.
- Train logistic regression, random forest classification, ridge regression, or random forest regression with leakage-safe preparation.
- Compare held-out metrics, select a persisted model, and make single or batch CSV predictions.
- Change the display name, reset the workspace to empty, or load an independent sample project.

The browser reads imports in a Web Worker with a 20-second timeout, then the API independently
parses the selected data before saving it. Limits are 25 MB per file, 200,000 data rows, 10,000
columns, and 10,000,000 cells. XLSX archives may expand to at most 160 MB. CSV files must use
UTF-8, with non-empty unique headers and consistent row widths. Spreadsheet formulas and error
cells are rejected; export calculated values before uploading. See
[Dataset workflow](docs/dataset-workflow.md) for the validation, storage, and recovery rules.

Older browser-only workspaces remain untouched in `localStorage` under `mindmesh.workspace.v1`; they are never automatically attached to an account. In **Workspace settings → Older browser workspace**, choose **Review browser copy** and confirm to import its personal projects and dataset previews into the current account. **Export browser copy** downloads the original JSON without changing it, including if it cannot be parsed. The import creates new IDs, so each account gets its own copy. Old records contain project details, dataset summaries, and up to 25 preview rows, but not complete uploaded files. Re-upload an original file if you need its full data in the account. Current account data is stored in SQLite, and complete new uploads are kept outside the public web root under `var/uploads`, accessible only through ownership-checked API endpoints.

The Model Lab includes clearly labeled synthetic churn and rent samples. Loading one creates an independent account-owned dataset through the normal validated upload endpoint. See the [teacher demo guide](docs/demo-guide.md) for the complete presentation flow, sample inputs, metric explanations, restart demonstration, and troubleshooting.

MindMesh does not include an LLM, deployment service, hyperparameter search, causal claims, or a production model monitoring system.

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

Backend checks can be run with:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
.\.venv\Scripts\python.exe -m ruff check backend
.\.venv\Scripts\python.exe -m ruff format --check backend\dataset_files.py backend\workspace.py backend\tests
```
