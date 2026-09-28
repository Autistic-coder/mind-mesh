import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../state/store'
import { Arrow, Confirm, DemoNote, Empty, PageTitle } from '../components/UI'
import type { Project } from '../state/types'

export function ProjectTable({ projects }: { projects: Project[] }) {
  const { state } = useWorkspace()
  return <div className="table-wrap"><table className="projects-table"><thead><tr><th>Project</th><th>Task</th><th>Updated</th><th><span className="sr-only">Open project</span></th></tr></thead><tbody>{projects.map(project => {
    const tasks = [...new Set(state.models.filter(model => model.projectId === project.id).map(model => model.task))]
    return <tr key={project.id}><td><Link className="project-name" to={`/projects/${project.id}`}>{project.name}</Link>{project.demo && <span className="project-demo">Demo</span>}</td><td className="muted capitalize">{tasks.length ? tasks.join(' / ') : 'Not configured'}</td><td className="muted whitespace-nowrap">{new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td><td className="text-right"><Link className="row-arrow" to={`/projects/${project.id}`} aria-label={`Open ${project.name}`}><Arrow /></Link></td></tr>
  })}</tbody></table></div>
}

export function Projects() {
  const { state } = useWorkspace()
  return <><PageTitle eyebrow="Room for your next idea" title="Your projects." description="From a question to a little more clarity. Keep each exploration together." />{state.projects.length ? <ProjectTable projects={[...state.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))} /> : <Empty title="Every project begins with a question.">Choose New Project above to start your first exploration.</Empty>}<DemoNote>Demo projects contain synthetic examples. Your own projects stay separate.</DemoNote></>
}

export function ProjectDetails() {
  const { id } = useParams()
  const { state, dispatch } = useWorkspace()
  const [confirm, setConfirm] = useState(false)
  const navigate = useNavigate()
  const project = state.projects.find(item => item.id === id)
  if (!project) return <Empty title="Project not found" to="/projects" action="View projects">This project may have been removed.</Empty>
  const datasets = state.datasets.filter(dataset => dataset.projectId === id)
  const models = state.models.filter(model => model.projectId === id)
  return <><Link className="text-link mb-6" to="/projects">← All projects</Link><PageTitle eyebrow={project.demo ? 'Synthetic demo project' : 'Project workspace'} title={project.name} description={project.description || 'A fresh exploration, ready for your data.'} action={<button className="text-link" onClick={() => setConfirm(true)}>Delete project</button>} /><div className="detail-sections"><section><div className="section-heading"><h2>Datasets <span className="count-inline">{datasets.length}</span></h2><Link className="text-link" to="/datasets">Manage datasets <Arrow /></Link></div>{datasets.length ? <div className="item-list">{datasets.map(dataset => <Link key={dataset.id} to={`/datasets?dataset=${dataset.id}`}><div><h3>{dataset.name}</h3><p>{dataset.rowCount} rows · {dataset.columns.length} columns · {dataset.source === 'synthetic' ? 'Synthetic demo' : 'Uploaded'}</p></div><Arrow /></Link>)}</div> : <Empty title="Bring your question some data." to="/datasets" action="Add a dataset">Upload a CSV or workbook, then assign it to this project.</Empty>}</section><section><div className="section-heading"><h2>Models <span className="count-inline">{models.length}</span></h2><Link className="text-link" to={`/train?project=${project.id}`}>Set up a simulation <Arrow /></Link></div>{models.length ? <div className="item-list">{models.map(model => <Link key={model.id} to={`/models/${model.id}`}><div><h3>{model.name}</h3><p className="capitalize">{model.task} · Demo model</p></div><Arrow /></Link>)}</div> : <Empty title="Your first comparison awaits." to={`/train?project=${project.id}`} action="Explore training">Choose a dataset and target to try a clearly labeled training simulation.</Empty>}</section></div>{confirm && <Confirm title={`Delete ${project.name}?`} confirmLabel="Delete project" onClose={() => setConfirm(false)} onConfirm={() => { dispatch({ type: 'project/delete', id: project.id }); navigate('/projects') }}>This deletes the project and its {models.length} demo models. Its datasets will remain in your workspace, unassigned.</Confirm>}</>
}
