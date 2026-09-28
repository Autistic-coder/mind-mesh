import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Arrow, Empty } from './components/UI'
import { Settings } from './components/Settings'
import { useWorkspace } from './state/store'
import { ProjectForm } from './components/ProjectForm'
import { Overview } from './pages/Overview'
import { Projects, ProjectDetails } from './pages/Projects'
import { Datasets } from './pages/Datasets'
import { Train } from './pages/Train'
import { Models, ModelDetails } from './pages/Models'
import { Predictions } from './pages/Predictions'
import { Ask } from './pages/Ask'

const navigation = [
  ['/', 'Overview'],
  ['/projects', 'Projects'],
  ['/datasets', 'Datasets'],
  ['/train', 'Train'],
  ['/models', 'Models'],
  ['/predictions', 'Predictions'],
  ['/ask', 'Ask MindMesh'],
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const [newProject, setNewProject] = useState(false)
  const { state, warning } = useWorkspace()
  const location = useLocation()
  const menuButton = useRef<HTMLButtonElement>(null)
  const previousPath = useRef(location.pathname)
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      window.scrollTo(0, 0)
      if (location.pathname !== '/ask') document.getElementById('main')?.focus()
      previousPath.current = location.pathname
    }
    document.title = `MindMesh · ${navigation.find(([path]) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)))?.[1] ?? 'Workspace'}`
  }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    const query = window.matchMedia('(max-width: 760px)')
    function onResize() {
      if (!query.matches) setMenuOpen(false)
    }
    query.addEventListener('change', onResize)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
      query.removeEventListener('change', onResize)
    }
  }, [menuOpen])
  const current =
    navigation.find(([path]) =>
      path === '/' ? location.pathname === '/' : location.pathname.startsWith(path),
    )?.[1] ?? 'Workspace'
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="mobile-header">
        <Link className="wordmark" to="/" onClick={() => setMenuOpen(false)}>
          MindMesh
        </Link>
        <button
          ref={menuButton}
          className="icon-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
        >
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </header>
      <aside id="sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Link className="wordmark" to="/" onClick={() => setMenuOpen(false)}>
          MindMesh
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([path, label]) => (
            <NavLink key={path} end={path === '/'} to={path} onClick={() => setMenuOpen(false)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="profile-button"
            onClick={() => {
              setSettings(true)
              setMenuOpen(false)
            }}
            aria-label="Workspace settings"
          >
            {state.displayName}
            <span aria-hidden="true">⌄</span>
          </button>
        </div>
      </aside>
      {settings && <Settings onClose={() => setSettings(false)} />}
      {newProject && <ProjectForm onClose={() => setNewProject(false)} />}
      {warning && (
        <div role="alert" className="storage-warning error">
          {warning}
        </div>
      )}
      <div className="workspace" inert={menuOpen}>
        <div className="topbar">
          <p className="eyebrow">
            Workspace <span>/</span> {current}
          </p>
          <button onClick={() => setNewProject(true)} className="button">
            New project <Arrow diagonal />
          </button>
        </div>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetails />} />
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/train" element={<Train />} />
            <Route path="/models" element={<Models />} />
            <Route path="/models/:id" element={<ModelDetails />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/ask" element={<Ask />} />
            <Route
              path="*"
              element={
                <Empty title="This page has moved" to="/" action="Go to overview">
                  Return to your workspace to continue.
                </Empty>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  )
}
