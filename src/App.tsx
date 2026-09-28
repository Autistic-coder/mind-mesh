import { useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Arrow, Empty, PageTitle } from './components/UI'
import { Settings } from './components/Settings'
import { useWorkspace } from './state/store'
import { ProjectForm } from './components/ProjectForm'
import { Overview } from './pages/Overview'
import { Projects, ProjectDetails } from './pages/Projects'
import { Datasets } from './pages/Datasets'
import { Train } from './pages/Train'
import { Models, ModelDetails } from './pages/Models'

const navigation = [['/', 'Overview'], ['/projects', 'Projects'], ['/datasets', 'Datasets'], ['/train', 'Train'], ['/models', 'Models'], ['/predictions', 'Predictions'], ['/ask', 'Ask MindMesh']]

function Section({ name }: { name: string }) {
  return <><PageTitle eyebrow="Your workspace" title={name} description="A little clarity for your next idea." /><Empty title="A fresh start" to="/" action="Back to overview">Your workspace is ready to explore.</Empty></>
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const [newProject, setNewProject] = useState(false)
  const { state, warning } = useWorkspace()
  const location = useLocation()
  const current = navigation.find(([path]) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path))?.[1] ?? 'Workspace'
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="mobile-header"><Link className="wordmark" to="/">MindMesh</Link><button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="sidebar">{menuOpen ? 'Close' : 'Menu'}</button></header>
    <aside id="sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}><Link className="wordmark" to="/" onClick={() => setMenuOpen(false)}>MindMesh</Link><nav aria-label="Main navigation">{navigation.map(([path, label]) => <NavLink key={path} end={path === '/'} to={path} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}</nav><div className="sidebar-footer"><button className="profile-button" onClick={() => { setSettings(true); setMenuOpen(false) }} aria-label="Workspace settings">{state.displayName}<span aria-hidden="true">⌄</span></button></div></aside>
    {settings && <Settings onClose={() => setSettings(false)} />}
    {newProject && <ProjectForm onClose={() => setNewProject(false)} />}
    {warning && <div role="alert" className="storage-warning error">{warning}</div>}
    <div className="workspace"><div className="topbar"><p className="eyebrow">Workspace <span>/</span> {current}</p><button onClick={() => setNewProject(true)} className="button">New project <Arrow diagonal /></button></div><main id="main" tabIndex={-1}><Routes><Route path="/" element={<Overview />} /><Route path="/projects" element={<Projects />} /><Route path="/projects/:id" element={<ProjectDetails />} /><Route path="/datasets" element={<Datasets />} /><Route path="/train" element={<Train />} /><Route path="/models" element={<Models />} /><Route path="/models/:id" element={<ModelDetails />} />{navigation.slice(5).map(([path, name]) => <Route key={path} path={`${path}/*`} element={<Section name={name} />} />)}<Route path="*" element={<Empty title="This page has moved" to="/" action="Go to overview">Return to your workspace to continue.</Empty>} /></Routes></main></div>
  </div>
}
