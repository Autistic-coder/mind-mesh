import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Arrow, DemoNote, Empty, PageTitle } from '../components/UI'
import { sampleModels, trainingError } from '../data/models'
import { useWorkspace } from '../state/store'
import type { Model, Task } from '../state/types'
import { ModelTable } from './Models'

export function Train() {
  const { state, dispatch } = useWorkspace()
  const [params] = useSearchParams()
  const [projectId, setProjectId] = useState(params.get('project') ?? state.projects[0]?.id ?? '')
  const [datasetId, setDatasetId] = useState('')
  const [target, setTarget] = useState('')
  const [task, setTask] = useState<Task>('classification')
  const [progress, setProgress] = useState<number | null>(null)
  const [results, setResults] = useState<Model[]>([])
  const [notice, setNotice] = useState('')
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const datasets = state.datasets.filter(dataset => dataset.projectId === projectId)
  const dataset = datasets.find(item => item.id === datasetId)
  const error = trainingError(dataset, target, task)
  const running = progress !== null
  function clearTimers() { if (interval.current) clearInterval(interval.current); if (timeout.current) clearTimeout(timeout.current) }
  useEffect(() => () => { if (interval.current) clearInterval(interval.current); if (timeout.current) clearTimeout(timeout.current) }, [])
  function run() {
    if (error || !dataset || !state.projects.some(project => project.id === projectId)) return
    setResults([]); setNotice(''); setProgress(0)
    interval.current = setInterval(() => setProgress(value => value === null ? null : Math.min(95, value + 5)), 180)
    timeout.current = setTimeout(() => { clearTimers(); const models = sampleModels(dataset, projectId, target, task); dispatch({ type: 'models/add', models }); setResults(models); setProgress(null); setNotice('Demo simulation complete. Two illustrative model entries were added to your library.') }, 3800)
  }
  return <><PageTitle eyebrow="A question becomes an experiment" title="Find your approach." description="Choose what you want to understand. Explore the training workflow with a local simulation." /><DemoNote>No training service is connected. Progress and comparison scores below are sample demonstrations.</DemoNote>{!state.projects.length ? <Empty title="Start with a project." to="/projects" action="View projects">Create a project, then assign a dataset to explore a training setup.</Empty> : <div className="train-layout"><section><form onSubmit={e => { e.preventDefault(); run() }}><fieldset disabled={running} className="border-0 p-0 m-0"><legend className="sr-only">Training setup</legend><div className="form-grid"><label className="field"><span>01 / Project</span><select value={projectId} required onChange={e => { setProjectId(e.target.value); setDatasetId(''); setTarget(''); setResults([]); setNotice('') }}><option value="">Select a project</option>{state.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="field"><span>02 / Dataset</span><select value={datasetId} required onChange={e => { setDatasetId(e.target.value); setTarget(''); setResults([]); setNotice('') }}><option value="">Select a dataset</option>{datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>03 / Target column</span><select value={target} required disabled={!dataset} onChange={e => { setTarget(e.target.value); setResults([]); setNotice('') }}><option value="">What would you like to predict?</option>{dataset?.columns.map(column => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}</select></label><label className="field"><span>04 / Task</span><select value={task} onChange={e => { setTask(e.target.value as Task); setResults([]); setNotice('') }}><option value="classification">Classification — predict a category</option><option value="regression">Regression — predict a number</option></select></label></div></fieldset>{!datasets.length && <p className="notice mt-6">No datasets are assigned to this project. <Link className="text-link" to="/datasets">Assign one in Datasets</Link>.</p>}{dataset && target && error && <p role="alert" className="error mt-6">{error}</p>}<div className="train-actions">{running ? <button type="button" className="button" onClick={() => { clearTimers(); setProgress(null); setNotice('Simulation cancelled. No model entries were created.') }}>Cancel simulation</button> : <button className="button primary" disabled={!!error || !projectId}>Run demo simulation <Arrow diagonal /></button>}<p className="muted text-xs">Runs locally · No real model is trained</p></div></form>{running && <div className="simulation-progress" role="status"><div className="flex justify-between gap-4 mb-3"><p>{progress < 35 ? 'Demo · Preparing sample comparison' : progress < 70 ? 'Demo · Illustrating training progress' : 'Demo · Preparing sample results'}</p><span>{progress}%</span></div><progress value={progress} max={100} aria-label="Demo simulation progress" /><p className="muted mt-3">Leaving this page cancels the simulation.</p></div>}</section><aside className="train-note"><p className="eyebrow">A little guidance</p><h3>What’s your question?</h3><p><strong>Classification</strong> predicts a category, like whether a customer might leave.</p><p><strong>Regression</strong> predicts a number, like an apartment’s monthly rent.</p><p className="train-note-footer">Your target is the answer you want to explore. The other columns become your features.</p></aside></div>}{notice && <p className="notice mt-8" role="status">{notice}</p>}{results.length > 0 && <section className="mt-10"><div className="section-heading"><h2>A sample comparison.</h2><Link className="text-link" to="/models">Model library <Arrow /></Link></div><p className="muted text-xs mb-5">Illustrative metrics—not measured performance. These values are fixed examples, not calculated from your data.</p><ModelTable models={results} /></section>}</>
}
