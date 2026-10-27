# Use your own data in MindMesh

1. Start both local services using the commands in README, then open http://127.0.0.1:5173.
2. Create an account or sign in. Each account has its own projects, originals, runs, and models.
3. Choose **New project** and give your question a name. You can edit it later. Projects organize
   datasets; deleting a project leaves its datasets unassigned.
4. Open **Datasets**, choose a CSV or XLSX file, and select a worksheet if asked. The first row must
   contain nonempty unique column names. Export spreadsheet formulas as values first. CSV should be
   UTF-8 with the same number of cells in every row.
5. Review the preview, row count, types, and empty cells. Choose a project and **Save dataset**.
   Review happens in your browser; the server independently validates and stores the complete file.
6. Choose **Train a model** or open **Model lab**. Pick the complete dataset. Older preview-only
   imports need their original file uploaded again.
7. Choose **Classification** for groups, such as churn Yes/No. Choose **Regression** for numbers,
   such as rent. The target is the answer you want the model to learn to predict. Select its column.
8. Choose features: information available before you know the answer. Exclude IDs, copies of the
   answer, and future information. Unavailable columns explain how to fix them. Number gaps use a
   training median; category gaps use the most frequent training value. Missing answers are omitted.
9. Select one or both available algorithms. Leave the recommended 80/20 split and random seed for
   a first attempt. Preparation is fitted on training rows only; both algorithms use the same split.
10. Click **Start training**. Queued/running states reflect the actual stored job state. If training
    fails, read its explanation, fix the input, and submit another run. Restarted jobs become interrupted.
11. Compare held-out results with the baseline. Higher accuracy, macro precision, recall, and F1 are
    better; lower MAE and RMSE are better. R² can be negative. Feature importance is not causation.
    A strong test score does not guarantee future accuracy. Avoid repeatedly tuning on the same test.
12. Click **Use this model**, then open **Predictions**. The fitted preparation and estimator are
    saved together. You can also choose any saved model directly from **Saved model**.
13. Enter one example, with a field for every input, and click **Predict one example**. Blank values
    use the saved preparation; unseen categories are accepted. Category probabilities are estimates.
14. For many examples, upload a UTF-8 CSV with all expected input column names. Use **Predict from
    a CSV** to download results in the original row order. Follow row-specific validation messages.
    Formula-like text is escaped to reduce spreadsheet formula execution risk when opening the export.
15. Reopen saved runs after refresh or a service restart. **Model details and management** shows
    settings/metrics and allows model deletion. Dataset deletion also removes dependent runs, models,
    artifacts, and predictions. These actions ask for confirmation.
16. Open **Ask MindMesh** for explanations. Preview a minimal summary and enable sharing only if you
    want that context sent to the provider. Keep personal information out of questions. Without a
    provider key, the page clearly shows static help instead of an invented AI answer.

Use the clearly labelled synthetic churn and rent samples to learn the workflow before using your
own dataset. Downloadable prediction examples are provided beside the batch form. Sign out from
account settings when finished; another account cannot access your records by changing resource IDs.
