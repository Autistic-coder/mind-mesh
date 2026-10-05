# MindMesh teacher demo guide

This guide presents the complete local workflow on **6 October 2026**. MindMesh trains real
scikit-learn models on complete server-stored tabular data. The included datasets are synthetic
demonstrations and do not establish real-world reliability.

## 1. Install prerequisites and dependencies

Open PowerShell in:

```text
C:\Users\Vaibhav\Desktop\ai ml\ai ml project
```

Install Python 3.11 or newer and Node.js 22.12 or newer. The checked-out workspace already includes
a local Node distribution under `.local`. For a fresh setup, run once:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd ci
.\.venv\Scripts\alembic.exe upgrade head
```

The Python requirements include pandas, NumPy, SciPy, joblib, and scikit-learn. Do not commit files
created under `var/`; that ignored directory holds the local database, private uploads, and fitted
models.

## 2. Start the backend and frontend

In the first PowerShell terminal:

```powershell
cd "C:\Users\Vaibhav\Desktop\ai ml\ai ml project"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

In a second PowerShell terminal, use this repeatable **frontend-only startup command**:

```powershell
cd "C:\Users\Vaibhav\Desktop\ai ml\ai ml project"
$env:PATH = "$(Get-Location)\.local\node-v24.21.0-win-x64;$env:PATH"
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. Frontend-only startup displays the interface, but the backend must
also be running for accounts, uploads, training, saved results, and predictions.

## 3. Create an account and sign in

1. Open the browser URL and choose **Create account**.
2. Enter a display name, email, and a password of at least 12 characters.
3. After registration, MindMesh opens a new empty private workspace.
4. Use **Workspace settings** or `/account` to sign out. Sign in again with the same account to
   recover its data.

## 4. Load a sample or upload your own dataset

Choose **Model lab** in the navigation. Step 1 offers two account-owned sample copies:

- `customer-churn.csv`: 160 synthetic customer rows.
- `rent-regression.csv`: 160 synthetic property rows.

**Load private copy** sends the sample through the same authenticated, validated upload endpoint as
other CSV files. **Download CSV** saves the fixture without importing it.

For your own data, open **Datasets**, choose or drag a UTF-8 CSV or XLSX file, select a worksheet if
needed, review the bounded browser preview, and confirm the upload. Return to Model Lab or choose
**Train a model** from its saved dataset details.

## 5. Choose the worksheet, task, target, and features

For the churn sample:

1. Choose **Classification — predict a category**.
2. Use `churn` as the target.
3. Keep `tenure_months`, `monthly_spend`, `support_calls`, `city`, and `plan` as features.
4. Exclude `customer_id`; the interface marks identifier-like or free-text fields.

For the rent sample:

1. Choose **Regression — predict a number**.
2. Use `monthly_rent` as the target.
3. Use `area_sq_ft`, `bedrooms`, `property_age`, `neighborhood`, and `property_type` as features.

The target is the answer shown in existing rows. Features are the information available when asking
the saved model for a future prediction. Unsupported text, date, mixed, all-missing, constant, and
very high-cardinality fields receive exclusion guidance instead of causing an unexplained crash.

## 6. Explain preparation and the split

Use the default 80% training / 20% held-out evaluation split and random seed 42.

- Rows with missing target answers are omitted and counted. Target answers are never imputed.
- Numeric feature gaps use the median calculated from training rows.
- Categorical feature gaps use the most frequent training value.
- Categorical values are one-hot encoded; unseen future categories do not crash prediction.
- Linear model numeric scaling is fitted on training rows.
- The fitted preparation and model are saved together as one pipeline.

The held-out rows are not used to fit preparation or the model. They estimate behavior on unseen
rows. Repeatedly choosing a model based on this same split means it is no longer an independent
final assessment.

## 7. Start training and interpret results

Classification supports:

- **Logistic regression**: a simple classification baseline.
- **Random forest classifier**: decision trees combined to learn more complex patterns.

Explain the displayed measurements:

- Accuracy: fraction of held-out answers predicted correctly.
- Macro precision: average class precision, giving each class equal weight.
- Macro recall: average fraction found within each class.
- Macro F1: average balance of precision and recall.
- Most-frequent baseline: accuracy from always choosing the common held-out class.
- Confusion matrix: actual classes by predicted classes.

Regression supports:

- **Ridge regression**: a regularized linear numeric baseline.
- **Random forest regressor**: decision trees combined for numeric predictions.

Explain MAE as the average absolute error in target units, RMSE as an error measure that emphasizes
larger misses, and R² as fit relative to predicting a constant mean. R² can be negative. Compare MAE
with the displayed mean baseline MAE. The actual-versus-predicted list uses held-out rows.

Feature importance is held-out permutation importance, measured on up to 1,000 rows with two
repeats. It shows predictive sensitivity, not causation.

## 8. Save and reopen the chosen model

Choose **Use this model** on one completed result. MindMesh stores the fitted preparation and
estimator under a private server-generated filename. Refresh the browser or restart both services,
open **Model lab → Results**, and choose the run under **Saved runs**. Its measured results and
selected model reappear.

If the application stopped during training, the run becomes **interrupted** after restart and asks
you to start a new run. It does not remain on a permanent spinner.

## 9. Make a single prediction

For churn, try:

| Feature         | Value   |
| --------------- | ------- |
| `tenure_months` | `8`     |
| `monthly_spend` | `1650`  |
| `support_calls` | `5`     |
| `city`          | `Delhi` |
| `plan`          | `Basic` |

Classification shows a predicted class and model-estimated class probabilities. These estimates are
not guarantees.

For rent, try `area_sq_ft=850`, `bedrooms=2`, `property_age=8`, `neighborhood=North`, and
`property_type=Apartment`. Regression returns a numeric monthly-rent estimate.

## 10. Upload a batch and download predictions

Use the included examples:

- `public/samples/customer-churn-batch.csv`
- `public/samples/rent-regression-batch.csv`

The batch must be UTF-8 CSV and include every ordered feature column listed beside the control.
MindMesh validates numeric values, keeps the input row order, accepts categories unseen during
training, appends predictions and available estimated probabilities, and downloads
`mindmesh-predictions.csv`.

## 11. Restart and demonstrate persistence

1. Note the selected run, model, and recent prediction history.
2. Stop both terminals with Ctrl+C.
3. Restart the backend using the commands in step 2.
4. Restart the frontend in the second terminal.
5. Sign in, open Model Lab, choose **Results**, and reopen the saved run.
6. Open **Predictions** and make another prediction with the persisted pipeline.

## 12. Demonstrate account privacy

1. Sign out and create a second account.
2. Open Datasets and Model Lab. The first account's datasets, runs, models, and history are absent.
3. Sign back into the first account and reopen its saved run.

The backend derives ownership from the server session for schema, training, results, models, single
and batch predictions, history, deletion, and artifact cleanup. Browser IDs do not establish access.

## Short presentation script

> MindMesh turns a complete private CSV or Excel worksheet into a measured tabular model. I choose
> the answer, called the target, and the available information, called features. Preparation learns
> missing-value rules and category encoding from training rows only. The model then predicts held-out
> rows it did not fit, which gives us real metrics rather than invented scores. I can compare a simple
> baseline with a random forest, inspect its errors, select a model, and reuse the exact saved pipeline
> for new records or a batch CSV. Data and model artifacts belong to the signed-in account. This is a
> local educational demo: its metrics describe this split and dataset, not guaranteed future or
> real-world performance.

## Requirements for your own dataset

- Use UTF-8 CSV or XLSX under 25 MB, with no spreadsheet formulas or macros.
- Use a unique, non-empty header and consistent rows.
- Include a target column containing existing answers. Regression targets must be numeric.
- Classification needs at least 20 usable rows, at least two classes, and at least two rows per class.
- Regression needs at least 10 usable target rows. More representative data is preferable.
- Select at most 50 numeric, boolean, or categorical features.
- Exclude identifiers, unrestricted text, dates, and categorical columns with more than 200 distinct
  values, or convert them deliberately before upload.
- Training is bounded to 100,000 usable rows. Arbitrary datasets are not guaranteed to be suitable.

## Troubleshooting

- **Port already in use:** stop the earlier process using port 8000 or 5173, then rerun the command.
- **`npm.cmd` or Node is missing:** set `PATH` to the checked-in `.local` Node directory as shown in
  step 2, or install a supported Node version.
- **Python import is missing:** rerun `.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt`.
- **Backend connection unavailable:** confirm the API terminal is running and
  `http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`.
- **Database column or table error:** stop the backend and run `.\.venv\Scripts\alembic.exe upgrade head`.
- **File rejected:** check format, UTF-8 encoding, headers, formulas, worksheet choice, and the limits
  described in `docs/dataset-workflow.md`.
- **Target rejected:** choose a numeric regression target or a classification target with enough
  examples in every class. Missing answers are omitted.
- **Feature rejected:** exclude unsupported text/date/mixed columns, constant columns, empty columns,
  and high-cardinality identifiers.
- **Training failed or was interrupted:** read the saved run message, correct the configuration, and
  start a new run. A failed run does not create a usable model.
- **Saved model is missing or incompatible:** keep `var/models` with the database and use the same
  dependency environment, or retrain the model.
