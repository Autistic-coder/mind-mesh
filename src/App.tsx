import { useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Arrow, Empty, PageTitle } from './components/UI'

const navigation = [['/', 'Overview'], ['/projects', 'Projects'], ['/datasets', 'Datasets'], ['/train', 'Train'], ['/models', 'Models'], ['/predictions', 'Predictions'], ['/ask', 'Ask MindMesh']]

function Section({ name }: { name: string }) {
  return <><PageTitle eyebrow="Your workspace" title={name} description="A little clarity for your next idea." /><Empty title="A fresh start" to="/" action="Back to overview">Your workspace is ready to explore.</Empty></>
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const current = navigation.find(([path]) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path))?.[1] ?? 'Workspace'
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="mobile-header"><Link className="wordmark" to="/">MindMesh</Link><button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="sidebar">{menuOpen ? 'Close' : 'Menu'}</button></header>
    <aside id="sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}><Link className="wordmark" to="/" onClick={() => setMenuOpen(false)}>MindMesh</Link><nav aria-label="Main navigation">{navigation.map(([path, label]) => <NavLink key={path} end={path === '/'} to={path} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}</nav><div className="sidebar-footer"><p className="eyebrow">Local workspace</p></div></aside>
    <div className="workspace"><div className="topbar"><p className="eyebrow">Workspace <span>/</span> {current}</p><Link to="/projects" className="button">Projects <Arrow diagonal /></Link></div><main id="main" tabIndex={-1}><Routes><Route path="/" element={<><PageTitle eyebrow="Welcome to MindMesh" title="Your work, all in one place." description="A thoughtful space for data, models, and your next question." /><Link to="/projects" className="text-link">Explore projects <Arrow /></Link></>} />{navigation.slice(1).map(([path, name]) => <Route key={path} path={`${path}/*`} element={<Section name={name} />} />)}<Route path="*" element={<Empty title="This page has moved" to="/" action="Go to overview">Return to your workspace to continue.</Empty>} /></Routes></main></div>
  </div>
}
