import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/context'
import { Arrow, Empty, PageTitle } from '../components/UI'
import type {
  DatasetSchema,
  ModelResult,
  PredictionHistory,
  RunConfig,
  SavedModel,
  Task,
  TrainingRun,
} from '../ml/types'
import { useWorkspace } from '../state/store'

const STEPS = [
  'Dataset',
  'Task and target',
  'Features and preparation',
  'Training',
  'Results',
  'Predictions',
]
const ALGORITHMS = {
  classification: [
    ['logistic_regression', 'Logistic regression', 'A simple baseline for classification.'],
    [
      'random_forest_classifier',
      'Random forest classifier',
      'Combines decision trees to learn more complex patterns.',
    ],
  ],
  regression: [
    [
      'ridge_regression',
      'Ridge regression',
      'A regularized linear baseline for numeric predictions.',
    ],
    [
      'random_forest_regressor',
      'Random forest regressor',
      'Combines decision trees for numeric predictions.',
    ],
  ],
} as const

const LABELS: Record<string, string> = {
  logistic_regression: 'Logistic regression',
  random_forest_classifier: 'Random forest classifier',
  ridge_regression: 'Ridge regression',
  random_forest_regressor: 'Random forest regressor',
}

function displayMetric(name: string) {
  return (
    {
      accuracy: 'Accuracy',
      precisionMacro: 'Precision (macro)',
      recallMacro: 'Recall (macro)',
      f1Macro: 'F1 (macro)',
      baselineAccuracy: 'Most-frequent baseline',
      mae: 'MAE',
      rmse: 'RMSE',
      r2: 'R²',
      baselineMae: 'Mean baseline MAE',
    }[name] ?? name
  )
}

function metricValue(name: string, value: number | null) {
  if (value == null) return 'Undefined'
  return name.includes('mae') || name === 'rmse' || name === 'baselineMae'
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : value.toFixed(3)
}

export function ModelLab() {
  const { state, uploadDataset } = useWorkspace()
  const { csrfToken, refresh } = useAuth()
  const [params, setParams] = useSearchParams()
  const completeDatasets = state.datasets.filter((dataset) => dataset.storageStatus === 'complete')
  const [step, setStep] = useState(0)
  const [datasetId, setDatasetId] = useState(params.get('dataset') ?? completeDatasets[0]?.id ?? '')
  const [schema, setSchema] = useState<DatasetSchema | null>(null)
  const [task, setTask] = useState<Task>('classification')
  const [target, setTarget] = useState('')
  const [features, setFeatures] = useState<string[]>([])
  const [algorithms, setAlgorithms] = useState<string[]>(
    ALGORITHMS.classification.map((item) => item[0]),
  )
  const [testSize, setTestSize] = useState(0.2)
  const [seed, setSeed] = useState(42)
  const [runs, setRuns] = useState<TrainingRun[]>([])
  const [models, setModels] = useState<SavedModel[]>([])
  const [history, setHistory] = useState<PredictionHistory[]>([])
  const [selectedRun, setSelectedRun] = useState<TrainingRun | null>(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [prediction, setPrediction] = useState<Record<string, unknown> | null>(null)
  const [batchFile, setBatchFile] = useState<File | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const controllers = useRef(new Set<AbortController>())
  const restoreRun = useRef<TrainingRun | null>(null)

  const request = useCallback(
    async function request<T>(path: string, init: RequestInit = {}) {
      const controller = new AbortController()
      controllers.current.add(controller)
      try {
        return await api<T>(path, {
          ...init,
          signal: controller.signal,
          headers: {
            ...(init.method && init.method !== 'GET' && csrfToken
              ? { 'X-CSRF-Token': csrfToken }
              : {}),
            ...init.headers,
          },
        })
      } catch (issue) {
        if (issue instanceof ApiError && issue.status === 401) void refresh()
        throw issue
      } finally {
        controllers.current.delete(controller)
      }
    },
    [csrfToken, refresh],
  )

  const refreshLibrary = useCallback(async () => {
    const [nextRuns, nextModels, nextHistory] = await Promise.all([
      request<TrainingRun[]>('ml/runs'),
      request<SavedModel[]>('ml/models'),
      request<PredictionHistory[]>('ml/predictions'),
    ])
    setRuns(nextRuns)
    setModels(nextModels)
    setHistory(nextHistory)
  }, [request])

  useEffect(() => {
    let active = true
    const pending = controllers.current
    void refreshLibrary().catch((issue) => {
      if (active) setError(issue instanceof Error ? issue.message : 'Unable to load saved runs.')
    })
    return () => {
      active = false
      for (const controller of pending) controller.abort()
      pending.clear()
    }
  }, [refreshLibrary])

  useEffect(() => {
    if (!datasetId) {
      setSchema(null)
      return
    }
    let active = true
    void request<DatasetSchema>(`ml/datasets/${encodeURIComponent(datasetId)}/schema`)
      .then((next) => {
        if (!active) return
        setSchema(next)
        const saved = restoreRun.current?.datasetId === datasetId ? restoreRun.current : null
        if (saved) {
          restoreRun.current = null
          setTask(saved.config.task)
          setTarget(saved.config.target)
          setFeatures(saved.config.features)
          setAlgorithms(saved.config.algorithms)
          setTestSize(saved.config.testSize)
          setSeed(saved.config.randomSeed)
          setSelectedRun(saved)
          setSelectedModelId('')
        } else {
          const defaultTarget = next.columns.at(-1)?.name ?? ''
          const inferredTask: Task =
            next.columns.at(-1)?.type === 'number' ? 'regression' : 'classification'
          setTask(inferredTask)
          setTarget(defaultTarget)
          setFeatures(
            next.columns
              .filter(
                (column) =>
                  column.name !== defaultTarget &&
                  ['number', 'category', 'boolean'].includes(column.type),
              )
              .slice(0, 12)
              .map((column) => column.name),
          )
          setAlgorithms(ALGORITHMS[inferredTask].map((item) => item[0]))
          setSelectedRun(null)
          setSelectedModelId('')
        }
        setParams({ dataset: datasetId }, { replace: true })
      })
      .catch(
        (issue) =>
          active &&
          setError(issue instanceof Error ? issue.message : 'Unable to inspect this dataset.'),
      )
    return () => {
      active = false
    }
  }, [datasetId, request, setParams])

  useEffect(() => {
    if (!selectedRun || !['queued', 'running'].includes(selectedRun.status)) return
    let active = true
    const timer = window.setInterval(() => {
      void request<TrainingRun>(`ml/runs/${encodeURIComponent(selectedRun.id)}`)
        .then((next) => {
          if (!active) return
          setSelectedRun(next)
          if (!['queued', 'running'].includes(next.status)) {
            window.clearInterval(timer)
            setBusy('')
            void refreshLibrary()
          }
        })
        .catch((issue) => {
          if (active)
            setError(issue instanceof Error ? issue.message : 'Unable to refresh training status.')
        })
    }, 700)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [refreshLibrary, request, selectedRun])

  const selectedModel = models.find((model) => model.id === selectedModelId)
  useEffect(() => {
    if (!selectedRun || selectedModelId) return
    const saved = models.find((model) => model.runId === selectedRun.id && model.selected)
    if (saved) setSelectedModelId(saved.id)
  }, [models, selectedModelId, selectedRun])
  const selectedFeatureKey = selectedModel?.features.join('\u0000') ?? ''
  useEffect(() => {
    if (!selectedFeatureKey) return
    setInputs(
      Object.fromEntries(selectedFeatureKey.split('\u0000').map((feature) => [feature, ''])),
    )
    setPrediction(null)
  }, [selectedFeatureKey, selectedModelId])

  function configurationChanged() {
    if (selectedRun?.status === 'completed')
      setNotice('Configuration changed. Train a new run for compatible results.')
    setSelectedRun(null)
    setSelectedModelId('')
    setPrediction(null)
  }

  function chooseTask(next: Task) {
    configurationChanged()
    setTask(next)
    setAlgorithms(ALGORITHMS[next].map((item) => item[0]))
    if (next === 'regression' && schema) {
      const numeric = schema.columns.find((column) => column.type === 'number')
      if (numeric) {
        setTarget(numeric.name)
        setFeatures((current) => current.filter((name) => name !== numeric.name))
      }
    }
  }

  async function loadSample(filename: string) {
    setBusy(filename)
    setError('')
    try {
      const response = await fetch(`/samples/${filename}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('The sample file could not be loaded.')
      const file = new File([await response.blob()], filename, { type: 'text/csv' })
      const dataset = await uploadDataset(file)
      setDatasetId(dataset.id)
      setNotice(`${dataset.name} is now a private copy in this account.`)
      setStep(1)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to load the sample dataset.')
    } finally {
      setBusy('')
    }
  }

  async function startTraining() {
    if (!datasetId || !target || !features.length || !algorithms.length) {
      setError('Choose a dataset, target, at least one feature, and at least one algorithm.')
      return
    }
    setBusy('training')
    setError('')
    setNotice('')
    try {
      const config: RunConfig = {
        datasetId,
        task,
        target,
        features,
        algorithms,
        testSize,
        randomSeed: seed,
      }
      const run = await request<TrainingRun>('ml/runs', {
        method: 'POST',
        body: JSON.stringify(config),
      })
      setSelectedRun(run)
      setStep(4)
      setNotice('Training is queued. You can continue using MindMesh while it runs.')
    } catch (issue) {
      setBusy('')
      setError(issue instanceof Error ? issue.message : 'Unable to start training.')
    }
  }

  function openRun(run: TrainingRun) {
    restoreRun.current = run
    if (run.datasetId === datasetId && schema) {
      restoreRun.current = null
      setTask(run.config.task)
      setTarget(run.config.target)
      setFeatures(run.config.features)
      setAlgorithms(run.config.algorithms)
      setTestSize(run.config.testSize)
      setSeed(run.config.randomSeed)
      setSelectedRun(run)
      const selected = models.find((model) => model.runId === run.id && model.selected)
      setSelectedModelId(selected?.id ?? '')
    } else setDatasetId(run.datasetId)
    setStep(4)
    setError('')
  }

  async function saveModel(modelId: string) {
    setBusy('select-model')
    try {
      const selected = await request<SavedModel>(`ml/models/${modelId}/select`, { method: 'POST' })
      setModels((current) =>
        current.map((model) => ({
          ...model,
          selected:
            model.id === selected.id && model.runId === selected.runId
              ? true
              : model.runId === selected.runId
                ? false
                : model.selected,
        })),
      )
      setSelectedModelId(selected.id)
      setNotice(`${LABELS[selected.algorithm]} is selected for predictions.`)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to select this model.')
    } finally {
      setBusy('')
    }
  }

  async function predictSingle() {
    if (!selectedModel) return
    setBusy('predict')
    setError('')
    try {
      const result = await request<Record<string, unknown>>(
        `ml/models/${selectedModel.id}/predict`,
        {
          method: 'POST',
          body: JSON.stringify({ record: inputs }),
        },
      )
      setPrediction(result)
      await refreshLibrary()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to make this prediction.')
    } finally {
      setBusy('')
    }
  }

  async function predictBatch() {
    if (!selectedModel || !batchFile || !csrfToken) return
    setBusy('batch')
    setError('')
    try {
      const form = new FormData()
      form.append('file', batchFile)
      const response = await fetch(
        `/api/ml/models/${encodeURIComponent(selectedModel.id)}/predict-batch`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'X-CSRF-Token': csrfToken },
          body: form,
        },
      )
      if (response.status === 401) void refresh()
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : 'Batch prediction failed.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'mindmesh-predictions.csv'
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Batch predictions were created and downloaded in the original row order.')
      await refreshLibrary()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to predict this batch.')
    } finally {
      setBusy('')
    }
  }

  const supportedFeatures = schema?.columns.filter(
    (column) => column.name !== target && ['number', 'category', 'boolean'].includes(column.type),
  )
  const runModels = selectedRun?.result?.models ?? []

  return (
    <div className="model-lab">
      <PageTitle
        eyebrow="Real tabular machine learning"
        title="Build a model, step by step."
        description="Prepare complete private data, measure models on a held-out split, and reuse the saved pipeline for predictions."
      />
      <ol className="lab-steps" aria-label="Model workflow">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              className={step === index ? 'active' : ''}
              aria-current={step === index ? 'step' : undefined}
              onClick={() => setStep(index)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      {error && (
        <p className="error my-5" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice my-5" role="status">
          {notice}
        </p>
      )}

      <section className="lab-panel" aria-labelledby={`lab-step-${step}`}>
        <p className="eyebrow muted">Step {step + 1} of 6</p>
        {step === 0 && (
          <>
            <h2 id="lab-step-0">Choose the complete dataset.</h2>
            <p className="lab-help">
              Training reads every row from the private original file. Preview-only imports cannot
              be trained.
            </p>
            {completeDatasets.length ? (
              <label className="field select-field lab-field">
                <span>Dataset</span>
                <select
                  value={datasetId}
                  onChange={(event) => {
                    configurationChanged()
                    setDatasetId(event.target.value)
                  }}
                >
                  {completeDatasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} · {dataset.rowCount.toLocaleString()} rows
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Empty title="Upload data or use a sample.">
                Your account has no complete dataset yet.
              </Empty>
            )}
            <div className="sample-grid">
              <article>
                <p className="eyebrow">Classification sample</p>
                <h3>Customer churn</h3>
                <p>
                  160 synthetic customers. Predict <strong>churn</strong> from account behavior.
                </p>
                <div className="lab-actions">
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() => void loadSample('customer-churn.csv')}
                  >
                    {busy === 'customer-churn.csv' ? 'Loading…' : 'Load private copy'}
                  </button>
                  <a className="text-link" href="/samples/customer-churn.csv" download>
                    Download CSV
                  </a>
                </div>
              </article>
              <article>
                <p className="eyebrow">Regression sample</p>
                <h3>Monthly rent</h3>
                <p>
                  160 synthetic homes. Predict <strong>monthly_rent</strong> from property details.
                </p>
                <div className="lab-actions">
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() => void loadSample('rent-regression.csv')}
                  >
                    {busy === 'rent-regression.csv' ? 'Loading…' : 'Load private copy'}
                  </button>
                  <a className="text-link" href="/samples/rent-regression.csv" download>
                    Download CSV
                  </a>
                </div>
              </article>
            </div>
            <p className="retention-note">
              These synthetic files demonstrate the workflow; their results are not evidence of
              real-world reliability. You can also{' '}
              <Link className="text-link" to="/datasets">
                upload your own CSV or XLSX
              </Link>
              .
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h2 id="lab-step-1">Choose the question and answer.</h2>
            <p className="lab-help">
              The target is the answer the model learns from existing rows.
            </p>
            <div className="choice-grid">
              <label className={task === 'classification' ? 'choice active' : 'choice'}>
                <input
                  type="radio"
                  name="task"
                  checked={task === 'classification'}
                  onChange={() => chooseTask('classification')}
                />
                <strong>Classification</strong>
                <span>Predict a category, such as churn: yes or no.</span>
              </label>
              <label className={task === 'regression' ? 'choice active' : 'choice'}>
                <input
                  type="radio"
                  name="task"
                  checked={task === 'regression'}
                  onChange={() => chooseTask('regression')}
                />
                <strong>Regression</strong>
                <span>Predict a number, such as price or rent.</span>
              </label>
            </div>
            <label className="field select-field lab-field">
              <span>Target column</span>
              <select
                value={target}
                onChange={(event) => {
                  configurationChanged()
                  setTarget(event.target.value)
                  setFeatures((current) => current.filter((item) => item !== event.target.value))
                }}
              >
                <option value="">Choose the answer column</option>
                {schema?.columns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} · {column.type}
                  </option>
                ))}
              </select>
            </label>
            {target && (
              <p className="inline-explanation">
                MindMesh will omit rows with a missing <strong>{target}</strong> answer and report
                the exact count. It never invents target answers.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2 id="lab-step-2">Choose information the model may use.</h2>
            <p className="lab-help">
              Features are the inputs used to predict the target. Exclude IDs, free text, dates, and
              anything unavailable when predicting.
            </p>
            <div className="feature-list">
              {schema?.columns
                .filter((column) => column.name !== target)
                .map((column) => {
                  const supported = ['number', 'category', 'boolean'].includes(column.type)
                  return (
                    <label
                      key={column.name}
                      className={!supported ? 'feature-option unsupported' : 'feature-option'}
                    >
                      <input
                        type="checkbox"
                        disabled={!supported}
                        checked={features.includes(column.name)}
                        onChange={(event) => {
                          configurationChanged()
                          setFeatures((current) =>
                            event.target.checked
                              ? [...current, column.name]
                              : current.filter((name) => name !== column.name),
                          )
                        }}
                      />
                      <span>
                        <strong>{column.name}</strong>
                        <small>
                          {column.type} · {column.missing.toLocaleString()} missing
                        </small>
                        {column.warnings.map((warning) => (
                          <em key={warning}>{warning}</em>
                        ))}
                      </span>
                    </label>
                  )
                })}
            </div>
            {!supportedFeatures?.length && (
              <p className="error">
                No supported input features remain. Convert a column to numeric or categorical data
                and upload it again.
              </p>
            )}
            <div className="preparation-note">
              <strong>Safe missing-value defaults</strong>
              <p>
                Numeric gaps use the training-data median. Categorical gaps use the most frequent
                training value. Categories are one-hot encoded, and unseen future categories remain
                valid. Every fitted preparation step sees training rows only.
              </p>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 id="lab-step-3">Train one model or compare two.</h2>
            <p className="lab-help">
              Both algorithms use the same reproducible split so their held-out results are
              comparable.
            </p>
            <div className="algorithm-list">
              {ALGORITHMS[task].map(([value, label, description]) => (
                <label
                  key={value}
                  className={algorithms.includes(value) ? 'choice active' : 'choice'}
                >
                  <input
                    type="checkbox"
                    checked={algorithms.includes(value)}
                    onChange={(event) => {
                      configurationChanged()
                      setAlgorithms((current) =>
                        event.target.checked
                          ? [...current, value]
                          : current.filter((item) => item !== value),
                      )
                    }}
                  />
                  <strong>{label}</strong>
                  <span>{description}</span>
                </label>
              ))}
            </div>
            <label className="field select-field lab-field">
              <span>Held-out evaluation split</span>
              <select
                value={testSize}
                onChange={(event) => {
                  configurationChanged()
                  setTestSize(Number(event.target.value))
                }}
              >
                <option value={0.1}>90% train / 10% test</option>
                <option value={0.2}>80% train / 20% test (recommended)</option>
                <option value={0.25}>75% train / 25% test</option>
                <option value={0.3}>70% train / 30% test</option>
              </select>
            </label>
            <p className="inline-explanation">
              The model learns from training rows. Held-out rows measure predictions it did not fit.
              Repeatedly choosing models using this split means it is not an independent final
              assessment.
            </p>
            <details className="advanced-settings">
              <summary>Advanced settings</summary>
              <label className="field lab-field">
                <span>Random seed</span>
                <input
                  type="number"
                  min="0"
                  max="2147483647"
                  value={seed}
                  onChange={(event) => {
                    configurationChanged()
                    setSeed(Number(event.target.value))
                  }}
                />
              </label>
              <p>Keeping this fixed reproduces the same train/test split.</p>
            </details>
            <button
              className="button primary mt-6"
              disabled={busy === 'training' || !algorithms.length}
              onClick={() => void startTraining()}
            >
              {busy === 'training' ? 'Starting…' : 'Start real training'} <Arrow diagonal />
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h2 id="lab-step-4">Measured results.</h2>
            {selectedRun && ['queued', 'running'].includes(selectedRun.status) && (
              <div className="training-state" role="status">
                <span className="status-dot" />{' '}
                <div>
                  <strong>
                    {selectedRun.status === 'queued' ? 'Queued' : 'Training on complete data'}
                  </strong>
                  <p>
                    The worker is fitting preparation and models. Progress is indeterminate; no
                    percentage is fabricated.
                  </p>
                </div>
              </div>
            )}
            {selectedRun?.status === 'failed' || selectedRun?.status === 'interrupted' ? (
              <p className="error" role="alert">
                {selectedRun.result?.error}
              </p>
            ) : null}
            {selectedRun?.status === 'completed' && (
              <>
                <p className="inline-explanation">{selectedRun.result?.evaluationNotice}</p>
                <div className="result-grid">
                  {runModels.map((result) => (
                    <ResultCard
                      key={result.modelId}
                      result={result}
                      selected={
                        selectedModelId === result.modelId ||
                        models.some((model) => model.id === result.modelId && model.selected)
                      }
                      onSelect={() => void saveModel(result.modelId)}
                      busy={busy === 'select-model'}
                    />
                  ))}
                </div>
              </>
            )}
            {!selectedRun && (
              <Empty title="No run selected.">
                Train a new configuration or reopen a saved run below.
              </Empty>
            )}
            <RunLibrary runs={runs} datasets={state.datasets} onOpen={openRun} />
          </>
        )}

        {step === 5 && (
          <>
            <h2 id="lab-step-5">Predict with the saved pipeline.</h2>
            {!selectedModel ? (
              <Empty title="Select a completed model first.">
                Open Results and choose the model you want to reuse.
              </Empty>
            ) : (
              <>
                <p className="lab-help">
                  Using {LABELS[selectedModel.algorithm]} to predict{' '}
                  <strong>{selectedModel.target}</strong>. Blank feature values use the saved
                  training-only imputation rules.
                </p>
                <div className="prediction-grid">
                  <div>
                    <h3>Single record</h3>
                    {selectedModel.features.map((feature) => {
                      const numeric = selectedModel.numericFeatures.includes(feature)
                      const column = schema?.columns.find((item) => item.name === feature)
                      return (
                        <label className="field lab-field" key={feature}>
                          <span>
                            {feature}
                            {numeric ? ' · number' : ' · category'}
                          </span>
                          <input
                            type={numeric ? 'number' : 'text'}
                            list={!numeric ? `values-${feature}` : undefined}
                            value={inputs[feature] ?? ''}
                            onChange={(event) =>
                              setInputs((current) => ({
                                ...current,
                                [feature]: event.target.value,
                              }))
                            }
                            placeholder="Blank uses saved missing-value handling"
                          />
                          {!numeric && (
                            <datalist id={`values-${feature}`}>
                              {column?.values.map((value) => (
                                <option key={value} value={value} />
                              ))}
                            </datalist>
                          )}
                        </label>
                      )
                    })}
                    <button
                      className="button primary"
                      disabled={busy === 'predict'}
                      onClick={() => void predictSingle()}
                    >
                      {busy === 'predict' ? 'Predicting…' : 'Predict'} <Arrow />
                    </button>
                    {prediction && (
                      <div className="prediction-answer" role="status">
                        <p>Model prediction</p>
                        <strong>{String(prediction.prediction)}</strong>
                        {prediction.probabilities != null && (
                          <div>
                            {Object.entries(prediction.probabilities as Record<string, number>).map(
                              ([label, value]) => (
                                <span key={label}>
                                  {label}: {(value * 100).toFixed(1)}% estimated probability
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3>Batch CSV</h3>
                    <p>
                      Include these columns: <strong>{selectedModel.features.join(', ')}</strong>.
                      Extra columns are retained and row order is preserved.
                    </p>
                    <label className="field lab-field">
                      <span>Batch CSV</span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(event) => setBatchFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={!batchFile || busy === 'batch'}
                      onClick={() => void predictBatch()}
                    >
                      {busy === 'batch' ? 'Predicting…' : 'Predict and download CSV'}
                    </button>
                    <p className="mt-5">
                      <a
                        className="text-link"
                        href={
                          selectedModel.task === 'classification'
                            ? '/samples/customer-churn-batch.csv'
                            : '/samples/rent-regression-batch.csv'
                        }
                        download
                      >
                        Download example batch
                      </a>
                    </p>
                  </div>
                </div>
                <section className="prediction-history">
                  <h3>Recent prediction history</h3>
                  {history
                    .filter((item) => item.modelId === selectedModel.id)
                    .slice(0, 5)
                    .map((item) => (
                      <p key={item.id}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span> Saved{' '}
                        {Array.isArray(item.output)
                          ? `${item.output.length} batch predictions`
                          : `prediction: ${String((item.output as Record<string, unknown>).prediction)}`}
                      </p>
                    ))}
                </section>
              </>
            )}
          </>
        )}
        <div className="lab-navigation">
          <button
            className="button"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            Back
          </button>
          <button
            className="button"
            disabled={step === 5}
            onClick={() => setStep((value) => Math.min(5, value + 1))}
          >
            Continue <Arrow />
          </button>
        </div>
      </section>
    </div>
  )
}

function RunLibrary({
  runs,
  datasets,
  onOpen,
}: {
  runs: TrainingRun[]
  datasets: Array<{ id: string; name: string }>
  onOpen: (run: TrainingRun) => void
}) {
  if (!runs.length) return null
  return (
    <section className="run-library">
      <div className="section-heading">
        <h3>Saved runs</h3>
        <span className="badge">Persistent</span>
      </div>
      {runs.map((run) => (
        <button key={run.id} onClick={() => onOpen(run)}>
          <span>
            <strong>
              {datasets.find((dataset) => dataset.id === run.datasetId)?.name ?? 'Removed dataset'}
            </strong>
            <small>
              {run.config.task} · {run.config.target} · {new Date(run.createdAt).toLocaleString()}
            </small>
          </span>
          <em className={`run-status ${run.status}`}>{run.status}</em>
        </button>
      ))}
    </section>
  )
}

function ResultCard({
  result,
  selected,
  onSelect,
  busy,
}: {
  result: ModelResult
  selected: boolean
  onSelect: () => void
  busy: boolean
}) {
  return (
    <article className={selected ? 'result-card selected' : 'result-card'}>
      <div className="result-heading">
        <div>
          <p className="eyebrow">Held-out evaluation</p>
          <h3>{LABELS[result.algorithm]}</h3>
        </div>
        {selected && <span className="badge upload">Selected</span>}
      </div>
      <div className="result-metrics">
        {Object.entries(result.metrics).map(([name, value]) => (
          <div key={name}>
            <span>{displayMetric(name)}</span>
            <strong>{metricValue(name, value)}</strong>
          </div>
        ))}
      </div>
      <p className="retention-note">
        {result.trainRows.toLocaleString()} training rows · {result.testRows.toLocaleString()}{' '}
        held-out rows · {result.targetRowsOmitted.toLocaleString()} rows omitted for missing targets
      </p>
      {result.confusionMatrix && result.classLabels && (
        <div className="compact-result">
          <strong>Confusion matrix</strong>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Actual \ predicted</th>
                  {result.classLabels.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.confusionMatrix.map((row, index) => (
                  <tr key={result.classLabels?.[index]}>
                    <th>{result.classLabels?.[index]}</th>
                    {row.map((value, cell) => (
                      <td key={cell}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result.actualVsPredicted && (
        <div className="compact-result">
          <strong>Actual versus predicted · first 8 held-out rows</strong>
          <div className="prediction-pairs">
            {result.actualVsPredicted.slice(0, 8).map((item, index) => (
              <span key={index}>
                {item.actual.toLocaleString()} →{' '}
                {item.predicted.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="compact-result">
        <strong>Feature importance</strong>
        <p className="muted">{result.importanceMethod}</p>
        {result.featureImportance.map((item) => (
          <div className="importance" key={item.feature}>
            <span>
              {item.feature} <small>{item.importance.toFixed(3)}</small>
            </span>
            <i style={{ width: `${Math.max(0, Math.min(100, item.importance * 100))}%` }} />
          </div>
        ))}
      </div>
      <button className="button" disabled={busy || selected} onClick={onSelect}>
        {selected ? 'Saved for predictions' : 'Select and save model'}
      </button>
    </article>
  )
}
