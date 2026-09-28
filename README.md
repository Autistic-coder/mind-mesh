# MindMesh

A calm workspace for datasets, model exploration, and your next question. Built with React, TypeScript, Vite, and Tailwind CSS, with locally bundled Cormorant Garamond and Manrope fonts.

**This release is a frontend-only demo.** Training progress, model comparisons, predictions, and assistant responses are explicitly simulated. There is no backend, authentication service, model training, or LLM connection. User-uploaded files and questions never leave the browser.

## Run locally

Requires Node.js 22.12 or newer (Node.js 24 LTS recommended).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally **http://127.0.0.1:5173**. Stop the server with Ctrl+C. To inspect the production build:

```sh
npm run build
npm run preview
```

The original Windows workspace has portable Node.js in the ignored `.local` directory. If Node/npm are not on your PATH, run this first in PowerShell:

```powershell
$env:PATH = "$PWD\.local\node-v24.21.0-win-x64;$env:PATH"
```

## Explore the workspace

- **Overview:** dataset/model counts, recent projects, New Project, and question handoff to Ask MindMesh.
- **Projects:** create named projects with descriptions, open their datasets/models, and delete with confirmation. Deletion removes associated models and unassigns datasets.
- **Datasets:** CSV/XLSX imports, worksheet selection, schema and missing-value summaries, previews, project assignment, and confirmed removal. Demo and uploaded datasets are separate.
- **Train:** choose a project, assigned dataset, target, and task. A cancellable simulation adds two demo model entries; navigating away cancels it.
- **Models:** filter by project/task and inspect feature schemas and illustrative metrics. Regression uses MAE, RMSE, and R² rather than accuracy.
- **Predictions:** required numeric/category/text fields derived from the selected model, example inputs, and deterministic simulated outputs. These are not real estimates.
- **Ask MindMesh:** suggested questions, validated input, conversation history, and locally written sample explanations. Enter sends; Shift+Enter adds a line break.
- **Workspace settings:** click the sidebar name to change the display name or reset local state with confirmation.

The initial workspace includes customer churn, monthly rent, and equipment failure: three projects, three synthetic 24-row datasets, and six illustrative models. Synthetic fixtures are defined separately from imports.

## Data and persistence

- Imports run in a Web Worker, with a 20-second timeout and cancellation. Limits: 5 MB per file, 20,000 data rows, and 100 columns.
- CSV files must use UTF-8. Headers must be non-empty and unique; data rows must have matching widths. Empty files, malformed CSV, invalid workbooks, and oversized inputs show actionable errors.
- `localStorage` stores a versioned workspace under `mindmesh.workspace.v1`: projects, dataset summaries, up to 25 preview rows per dataset, model schemas, display name, and the latest 100 chat messages. Tables display up to 10 preview rows.
- Full uploaded files are not retained. Training and predictions use only local demo logic; no model is fitted to imported data.
- Saved state is validated before use. Invalid state is preserved and writes are blocked until an explicit reset. Storage failures or the conservative 3 MB state budget trigger a visible session-only warning.
- Dataset removal preserves model schemas; their details show “Source removed.” Reset removes local uploads, custom projects, generated models, and chat, then restores the initial examples.
- State belongs to this browser and origin, not an account. Changing hostname or port gives a separate workspace. Keep one active tab to avoid concurrent storage writes.

## Verification

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Playwright serves the production build on port 4173 and checks navigation, projects, CSV/XLSX imports, worksheet selection, invalid inputs, assignments, training completion/cancellation, model details, predictions, chat, refresh persistence, reset, corrupt storage, and mobile/keyboard flows. Run the build before browser tests. Unit tests cover parsing boundaries, task validation, prediction validation, storage errors, and deletion relationships.

The original Windows workspace keeps browser binaries in `.local/browsers`. To reuse them:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.local\browsers"
npm run test:e2e
```

## Code organization

- `src/pages`: the seven views and project/model details.
- `src/components`: shared dialogs, UI primitives, project creation, and settings.
- `src/data`: synthetic fixtures, parsing worker, and simulated behaviors.
- `src/state`: typed entities, reducer/context, validation, and persistence.
- `tests`: focused unit and browser acceptance tests.

SheetJS is installed from its [official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). The dependency lockfile is committed. Generated builds, dependencies, test artifacts, portable tooling, and environment files are ignored.

## Future backend phase

The longer-term MindMesh vision includes accounts and shared workspaces, persistent datasets, genuine training and evaluation, saved model artifacts, real predictions, and an LLM assistant. None of these services is implemented or represented as real in this frontend release.
