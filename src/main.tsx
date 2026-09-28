import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import './styles.css'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { WorkspaceProvider } from './state/WorkspaceProvider'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><WorkspaceProvider><App /></WorkspaceProvider></BrowserRouter></React.StrictMode>,
)
