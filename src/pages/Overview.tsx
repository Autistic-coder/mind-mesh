import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arrow, Empty } from '../components/UI'
import { useWorkspace } from '../state/store'
import { ProjectTable } from './Projects'

export function Overview() {
  const { state, createProject } = useWorkspace()
  const [sampleBusy, setSampleBusy] = useState(false)
  const [sampleError, setSampleError] = useState('')
  const navigate = useNavigate()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return (
    <div className="overview">
      <header className="overview-greeting">
        <h1>
          Good {greeting}, {state.displayName}.
        </h1>
        <p>Your work, all in one place.</p>
      </header>
      <section className="overview-middle" aria-label="Workspace counts">
        <div className="overview-ask">
          <h2>Start with your data.</h2>
          <p className="muted mt-4">Create a project, then import a CSV or XLSX dataset.</p>
          <Link className="button primary mt-6" to="/datasets">
            View datasets <Arrow diagonal />
          </Link>
          {state.datasets.some((dataset) => dataset.storageStatus === 'complete') && (
            <Link className="text-link mt-5" to="/model-lab">
              Open model lab <Arrow />
            </Link>
          )}
        </div>
        <div className="overview-counts">
          <Link to="/projects">
            <span>{String(state.projects.length).padStart(2, '0')}</span>
            <p>Projects</p>
          </Link>
          <Link to="/datasets">
            <span>{String(state.datasets.length).padStart(2, '0')}</span>
            <p>Datasets</p>
          </Link>
        </div>
      </section>
      <section className="recent-projects">
        <div className="section-heading">
          <h2>Recent projects</h2>
          <Link className="text-link" to="/projects">
            View all <Arrow />
          </Link>
        </div>
        {state.projects.length ? (
          <ProjectTable
            projects={[...state.projects]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 3)}
          />
        ) : (
          <Empty title="A fresh page for your ideas.">
            Create a project using New Project above, or start with your own copy of a sample.
          </Empty>
        )}
        {state.projects.length === 0 && (
          <div className="sample-action">
            <button
              className="button"
              disabled={sampleBusy}
              onClick={async () => {
                setSampleBusy(true)
                setSampleError('')
                try {
                  const project = await createProject(
                    'Sample research',
                    'A place to explore a question. Add your own CSV or XLSX dataset to begin.',
                  )
                  navigate(`/projects/${project.id}`)
                } catch (issue) {
                  setSampleError(
                    issue instanceof Error ? issue.message : 'Unable to load sample project.',
                  )
                  setSampleBusy(false)
                }
              }}
            >
              {sampleBusy ? 'Loading…' : 'Load sample project'} <Arrow diagonal />
            </button>
            {sampleError && (
              <p className="error mt-4" role="alert">
                {sampleError}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
