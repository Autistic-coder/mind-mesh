export const suggestions = [
  'Explain my customer churn model',
  'How should I evaluate monthly rent?',
  'What could signal equipment failure?',
]

export function sampleResponse(question: string): string {
  const text = question.toLowerCase()
  if (/churn|customer|retention/.test(text))
    return 'Customer churn is a classification example: the target is whether a customer leaves. In the synthetic dataset, tenure, monthly charge, and contract type are feature fields.\n\nA real evaluation would compare predictions with held-out outcomes and consider both missed churners and false alarms. The accuracy and F1 numbers in this workspace are fixed illustrations; they do not show measured performance or prove that any feature causes churn.\n\nTry opening Customer churn in Projects, then inspect a demo model or change its prediction inputs.'
  if (/rent|regression|mae|rmse/.test(text))
    return 'Monthly rent is a regression example: the target is a number, not a category. The synthetic features include floor area, bedrooms, and neighborhood.\n\nMAE describes average absolute error in the target’s units. RMSE penalizes larger errors more heavily. R² compares a model with a mean-value baseline; it is not classification accuracy. The displayed values here are illustrative, not evaluated on your data.\n\nIn Train, select the Monthly rent project and dataset, choose monthly_rent as the target, and select Regression to explore a sample comparison.'
  if (/equipment|failure|maintenance/.test(text))
    return 'Equipment failure is a classification example with synthetic temperature, vibration, and operating-hour readings. The target is a Yes/No failure label.\n\nIn a real project, rare failures would make class balance, missed failures, and false alarms important evaluation questions. This frontend cannot establish failure risk, detect actual faults, or provide maintenance advice.\n\nOpen the Equipment failure dataset to inspect its columns, or explore the required feature inputs in Predictions. Every result there is simulated.'
  if (/upload|dataset|csv|xlsx|excel/.test(text))
    return 'Open Datasets and choose a CSV or XLSX file with a header row and at least one data row. For a workbook with multiple sheets, choose one worksheet. Assign the imported dataset to a project before exploring Train.\n\nFiles are parsed locally. The workspace saves column summaries and up to 25 preview rows, not the full file. No dataset is sent to an LLM or training service.'
  if (/train|model|classification/.test(text))
    return 'Choose a project, an assigned dataset, a target column, and a task in Train. Classification explores categories; regression explores numeric outcomes.\n\nRun demo simulation shows sample progress and adds two illustrative entries to Models. It does not fit algorithms, measure scores, or create real model artifacts. You can cancel before completion without creating entries.'
  return 'This is a locally written sample response, not an LLM answer. I cannot analyze your uploaded data or answer arbitrary questions yet.\n\nYou can explore customer churn, monthly rent, equipment failure, dataset uploads, or the demo training workflow using the suggested questions. A real assistant will be connected in a later backend phase.'
}
