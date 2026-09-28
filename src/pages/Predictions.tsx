import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Arrow, DemoNote, Empty, PageTitle } from '../components/UI'
import { predictionErrors, simulatePrediction } from '../data/predictions'
import { useWorkspace } from '../state/store'
import type { Model } from '../state/types'

function PredictionForm({ model }: { model: Model }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<string | null>(null)
  function update(name: string, value: string) {
    setValues((old) => ({ ...old, [name]: value }))
    setErrors((old) => {
      const next = { ...old }
      delete next[name]
      return next
    })
    setResult(null)
  }
  return (
    <div className="prediction-layout">
      <section>
        <div className="section-heading">
          <h2>What goes in.</h2>
          <button
            className="text-link"
            onClick={() => {
              setValues(
                Object.fromEntries(
                  model.features.map((feature) => [feature.name, feature.values[0] ?? '']),
                ),
              )
              setErrors({})
              setResult(null)
            }}
          >
            Fill example values <Arrow />
          </button>
        </div>
        <p className="muted text-xs mb-6">
          All feature fields are required. Target: <strong>{model.target.name}</strong>.
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            const next = predictionErrors(model, values)
            setErrors(next)
            setResult(null)
            if (Object.keys(next).length === 0) setResult(simulatePrediction(model, values))
            else
              document
                .getElementById(
                  `feature-${model.features.findIndex((feature) => !!next[feature.name])}`,
                )
                ?.focus()
          }}
        >
          <div className="form-grid">
            {model.features.map((feature, index) => (
              <label className="field" key={feature.name}>
                <span>
                  {feature.name} <span className="muted font-normal">/ {feature.type}</span>
                </span>
                {feature.type === 'category' && feature.values.length > 0 ? (
                  <select
                    id={`feature-${index}`}
                    required
                    aria-invalid={!!errors[feature.name]}
                    aria-describedby={errors[feature.name] ? `error-${index}` : undefined}
                    value={values[feature.name] ?? ''}
                    onChange={(e) => update(feature.name, e.target.value)}
                  >
                    <option value="">Select a value</option>
                    {feature.values.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`feature-${index}`}
                    type={feature.type === 'number' ? 'number' : 'text'}
                    step={feature.type === 'number' ? 'any' : undefined}
                    maxLength={200}
                    required
                    aria-invalid={!!errors[feature.name]}
                    aria-describedby={errors[feature.name] ? `error-${index}` : undefined}
                    value={values[feature.name] ?? ''}
                    placeholder={feature.values[0] ? `e.g. ${feature.values[0]}` : 'Enter a value'}
                    onChange={(e) => update(feature.name, e.target.value)}
                  />
                )}
                {errors[feature.name] && (
                  <span id={`error-${index}`} className="field-error" role="alert">
                    {errors[feature.name]}
                  </span>
                )}
              </label>
            ))}
          </div>
          <button className="button primary mt-8">
            Simulate prediction <Arrow diagonal />
          </button>
        </form>
      </section>
      <aside className="prediction-result" aria-live="polite">
        <p className="eyebrow">An illustrative outcome</p>
        {result !== null ? (
          <>
            <p className="prediction-value">{result}</p>
            <p className="prediction-target">{model.target.name}</p>
            <span className="badge mt-5">Simulated result</span>
            <p className="muted text-xs mt-5 leading-6">
              Simulated prediction—no trained model used. This deterministic example responds to
              your inputs; it is not a reliable estimate.
            </p>
          </>
        ) : (
          <>
            <h3>
              A possibility,
              <br />
              not a promise.
            </h3>
            <p className="muted text-sm leading-7 mt-5">
              Enter feature values to preview how a prediction will appear. Real predictions will
              become available when a backend model service is connected.
            </p>
          </>
        )}
      </aside>
    </div>
  )
}

export function Predictions() {
  const { state } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const model =
    state.models.find((item) => item.id === params.get('model')) ??
    (!params.has('model') ? state.models[0] : undefined)
  return (
    <>
      <PageTitle
        eyebrow="From features to possibilities"
        title="Try a what-if."
        description="Change a few inputs. Explore what the prediction experience will feel like."
      />
      <DemoNote>
        Simulated prediction—no trained model used. Outputs are frontend examples only.
      </DemoNote>
      {state.models.length ? (
        <>
          <div className="model-picker">
            <label className="field">
              <span>Choose a demo model</span>
              <select
                value={model?.id ?? ''}
                onChange={(e) => setParams({ model: e.target.value })}
              >
                <option value="" disabled>
                  Select a model
                </option>
                {state.models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {state.projects.find((project) => project.id === item.projectId)?.name} ·{' '}
                    {item.name} ({item.task})
                  </option>
                ))}
              </select>
            </label>
            {model && (
              <Link className="text-link" to={`/models/${model.id}`}>
                Model details <Arrow />
              </Link>
            )}
          </div>
          {model ? (
            <PredictionForm model={model} key={model.id} />
          ) : (
            <Empty title="Choose another model.">
              The linked model is no longer available. Select a model above.
            </Empty>
          )}
        </>
      ) : (
        <Empty title="A model makes the first step." to="/train" action="Explore training">
          Run a demo simulation to create models and their feature forms.
        </Empty>
      )}
    </>
  )
}
