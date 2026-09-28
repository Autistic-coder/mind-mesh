import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Arrow, DemoNote, Empty, PageTitle } from '../components/UI'
import { formatMetric } from '../data/models'
import { useWorkspace } from '../state/store'
import type { Model } from '../state/types'

export function ModelTable({ models }: { models: Model[] }) {
  const { state } = useWorkspace()
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th>Project / task</th>
            <th>Sample metrics</th>
            <th>
              <span className="sr-only">View model</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id}>
              <td>
                <Link className="project-name" to={`/models/${model.id}`}>
                  {model.name}
                </Link>
                <span className="block mt-2">
                  <span className="badge">Demo model</span>
                </span>
              </td>
              <td>
                <p>{state.projects.find((project) => project.id === model.projectId)?.name}</p>
                <p className="muted capitalize mt-2 text-xs">{model.task}</p>
              </td>
              <td>
                <div className="table-metrics">
                  {Object.entries(model.metrics).map(([label, value]) => (
                    <span key={label}>
                      <span className="muted">{label}</span> {formatMetric(label, value)}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <Link
                  className="row-arrow"
                  to={`/models/${model.id}`}
                  aria-label={`View ${model.name} for ${state.projects.find((project) => project.id === model.projectId)?.name}`}
                >
                  <Arrow />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Models() {
  const { state } = useWorkspace()
  const [project, setProject] = useState('')
  const [task, setTask] = useState('')
  const models = state.models.filter(
    (model) => (!project || model.projectId === project) && (!task || model.task === task),
  )
  return (
    <>
      <PageTitle
        eyebrow="Different approaches, fresh perspectives"
        title="Your model library."
        description="Explore sample comparisons and the shape of a model. Every entry here is a demo."
        action={
          <Link className="button" to="/train">
            New simulation <Arrow diagonal />
          </Link>
        }
      />
      <DemoNote>
        Illustrative metrics—not measured performance. No real models have been trained.
      </DemoNote>
      <div className="filters">
        <label className="field">
          <span>Project</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Task</span>
          <select value={task} onChange={(e) => setTask(e.target.value)}>
            <option value="">All tasks</option>
            <option value="classification">Classification</option>
            <option value="regression">Regression</option>
          </select>
        </label>
        <p className="muted text-xs self-end pb-4">
          {models.length} {models.length === 1 ? 'model' : 'models'}
        </p>
      </div>
      {models.length ? (
        <ModelTable models={models} />
      ) : (
        <Empty title="No models in this view." to="/train" action="Set up a simulation">
          Try another filter, or create a demo comparison from a dataset.
        </Empty>
      )}
    </>
  )
}

export function ModelDetails() {
  const { id } = useParams()
  const { state } = useWorkspace()
  const model = state.models.find((item) => item.id === id)
  if (!model)
    return (
      <Empty title="Model not found" to="/models" action="Browse models">
        This demo model may have been removed with its project.
      </Empty>
    )
  const dataset = state.datasets.find((item) => item.id === model.datasetId)
  const project = state.projects.find((item) => item.id === model.projectId)
  return (
    <>
      <Link className="text-link mb-6" to="/models">
        ← Model library
      </Link>
      <PageTitle
        eyebrow={`${model.task} / Demo model`}
        title={model.name}
        description={`A sample approach for ${project?.name ?? 'this project'}. Created ${new Date(model.createdAt).toLocaleDateString()}.`}
        action={
          <Link className="button primary" to={`/predictions?model=${model.id}`}>
            Try a prediction <Arrow diagonal />
          </Link>
        }
      />
      <DemoNote>
        Illustrative metrics—not measured performance. This entry is a frontend example, not a
        trained model.
      </DemoNote>
      <div className="metric-strip">
        {Object.entries(model.metrics).map(([name, value]) => (
          <div key={name}>
            <p className="eyebrow">Sample {name}</p>
            <p className="metric-value">{formatMetric(name, value)}</p>
            <p className="muted text-xs">
              {name === 'MAE' || name === 'RMSE'
                ? 'Target units · lower is better'
                : 'Higher is better'}
            </p>
          </div>
        ))}
      </div>
      <div className="model-context">
        <div>
          <p className="eyebrow muted mb-3">Source dataset</p>
          {dataset ? (
            <Link className="text-link" to={`/datasets?dataset=${dataset.id}`}>
              {model.datasetName}
              <Arrow />
            </Link>
          ) : (
            <p>
              {model.datasetName} <span className="badge">Source removed</span>
            </p>
          )}
        </div>
        <div>
          <p className="eyebrow muted mb-3">Target column</p>
          <p>
            {model.target.name} <span className="muted text-xs">({model.target.type})</span>
          </p>
        </div>
        <div>
          <p className="eyebrow muted mb-3">Project</p>
          <Link className="text-link" to={`/projects/${model.projectId}`}>
            {project?.name}
            <Arrow />
          </Link>
        </div>
      </div>
      <section className="mt-10">
        <div className="section-heading">
          <h2>What goes in.</h2>
          <span className="muted text-xs">{model.features.length} feature fields</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Type</th>
                <th>Example values</th>
              </tr>
            </thead>
            <tbody>
              {model.features.map((feature) => (
                <tr key={feature.name}>
                  <td>{feature.name}</td>
                  <td className="capitalize muted">{feature.type}</td>
                  <td className="muted">
                    {feature.values.slice(0, 3).join(', ') || 'No observed values'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="retention-note">
          Feature schemas are saved with each demo model, so the prediction form works even after
          its original dataset is removed.
        </p>
      </section>
    </>
  )
}
