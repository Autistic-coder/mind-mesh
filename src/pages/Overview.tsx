import { Link } from 'react-router-dom'
import { Arrow, Empty } from '../components/UI'
import { useWorkspace } from '../state/store'
import { ProjectTable } from './Projects'

export function Overview() {
  const { state } = useWorkspace()
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
            Create a project using New Project above.
          </Empty>
        )}
      </section>
    </div>
  )
}
