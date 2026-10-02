import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import './styles.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { WorkspaceProvider } from './state/WorkspaceProvider'
import { AuthProvider } from './auth/AuthProvider'
import { AccountSettings, Register, SignIn } from './auth/Pages'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/account" element={<AccountSettings />} />
          <Route
            path="/*"
            element={
              <WorkspaceProvider>
                <App />
              </WorkspaceProvider>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
