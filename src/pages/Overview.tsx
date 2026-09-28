import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arrow, Empty } from '../components/UI'
import { useWorkspace } from '../state/store'
import { ProjectTable } from './Projects'

export function Overview() {
  const { state } = useWorkspace()
  const [question, setQuestion] = useState('')
  const navigate = useNavigate()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  function ask(value: string) {
    if (value.trim()) navigate(`/ask?q=${encodeURIComponent(value.trim())}`)
  }
  return (
    <div className="overview">
      <header className="overview-greeting">
        <h1>
          Good {greeting}, {state.displayName}.
        </h1>
        <p>Your work, all in one place.</p>
      </header>
      <section className="overview-middle" aria-label="Ask and workspace counts">
        <div className="overview-ask">
          <h2>Ask MindMesh</h2>
          <form
            className="ask-bar"
            onSubmit={(e) => {
              e.preventDefault()
              ask(question)
            }}
          >
            <label className="sr-only" htmlFor="overview-question">
              Ask about a dataset or model
            </label>
            <input
              id="overview-question"
              required
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about a dataset or model…"
            />
            <button className="button primary" disabled={!question.trim()}>
              Ask <Arrow diagonal />
            </button>
          </form>
          <button
            className="text-link suggested-link"
            onClick={() => ask('Explain my customer churn model')}
          >
            Explain my customer churn model
          </button>
        </div>
        <div className="overview-counts">
          <Link to="/datasets">
            <span>{String(state.datasets.length).padStart(2, '0')}</span>
            <p>Datasets</p>
          </Link>
          <Link to="/models">
            <span>{String(state.models.length).padStart(2, '0')}</span>
            <p>Models</p>
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
      <p className="overview-footnote">
        <span className="status-dot" /> Frontend demo · All model results are illustrative
      </p>
    </div>
  )
}
