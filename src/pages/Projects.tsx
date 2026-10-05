import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../state/store'
import { Arrow, Confirm, Empty, PageTitle } from '../components/UI'
import type { Project } from '../state/types'

export function ProjectTable({ projects }: { projects: Project[] }) {
  const { state } = useWorkspace()
  return (
    <div className="table-wrap">
      <table className="projects-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Datasets</th>
            <th>Updated</th>
            <th>
              <span className="sr-only">Open project</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>
                <Link className="project-name" to={`/projects/${project.id}`}>
                  {project.name}
                </Link>
              </td>
              <td className="muted">
                {state.datasets.filter((dataset) => dataset.projectId === project.id).length}
              </td>
              <td className="muted whitespace-nowrap">
                {new Date(project.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </td>
              <td className="text-right">
                <Link
                  className="row-arrow"
                  to={`/projects/${project.id}`}
                  aria-label={`Open ${project.name}`}
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

export function Projects() {
  const { state } = useWorkspace()
  return (
    <>
      <PageTitle
        eyebrow="Room for your next idea"
        title="Your projects."
        description="Keep your datasets organized around each project."
      />
      {state.projects.length ? (
        <ProjectTable
          projects={[...state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
        />
      ) : (
        <Empty title="Every project begins with a question.">
          Choose New Project above to create your first project.
        </Empty>
      )}
    </>
  )
}

export function ProjectDetails() {
  const { id } = useParams()
  const { state, deleteProject } = useWorkspace()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const project = state.projects.find((item) => item.id === id)
  if (!project)
    return (
      <Empty title="Project not found" to="/projects" action="View projects">
        This project may have been removed.
      </Empty>
    )
  const datasets = state.datasets.filter((dataset) => dataset.projectId === id)
  return (
    <>
      <Link className="text-link mb-6" to="/projects">
        ← All projects
      </Link>
      <PageTitle
        eyebrow="Project workspace"
        title={project.name}
        description={project.description || 'Ready for your data.'}
        action={
          <button className="text-link" onClick={() => setConfirm(true)}>
            Delete project
          </button>
        }
      />
      <div className="detail-sections">
        <section>
          <div className="section-heading">
            <h2>
              Datasets <span className="count-inline">{datasets.length}</span>
            </h2>
            <Link className="text-link" to={`/datasets?project=${encodeURIComponent(project.id)}`}>
              Add or manage datasets <Arrow />
            </Link>
          </div>
          {datasets.length ? (
            <div className="item-list">
              {datasets.map((dataset) => (
                <Link key={dataset.id} to={`/datasets?dataset=${dataset.id}`}>
                  <div>
                    <h3>{dataset.name}</h3>
                    <p>
                      {dataset.rowCount} rows · {dataset.columns.length} columns ·{' '}
                      {dataset.storageStatus === 'preview-only'
                        ? 'Preview only'
                        : dataset.storageStatus === 'missing'
                          ? 'Original unavailable'
                          : 'Complete upload'}
                    </p>
                  </div>
                  <Arrow />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="Add data to this project."
              to={`/datasets?project=${encodeURIComponent(project.id)}`}
              action="Choose a dataset"
            >
              Upload a CSV or XLSX file with this project already selected.
            </Empty>
          )}
        </section>
      </div>
      {confirm && (
        <Confirm
          title={`Delete ${project.name}?`}
          confirmLabel="Delete project"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            if (busy) return
            setBusy(true)
            setError('')
            try {
              await deleteProject(project.id)
              navigate('/projects')
            } catch (issue) {
              setError(issue instanceof Error ? issue.message : 'Unable to delete project.')
              setBusy(false)
            }
          }}
        >
          This deletes the project. Its datasets will remain in your workspace, unassigned.
          {error && (
            <span className="error block mt-4" role="alert">
              {error}
            </span>
          )}
        </Confirm>
      )}
    </>
  )
}
