import { Navigate, useLocation } from 'react-router-dom'
import App from '../App'
import { WorkspaceProvider } from '../state/WorkspaceProvider'
import { useAuth } from './context'

export function ProtectedWorkspace() {
  const { user, status, refresh } = useAuth()
  const location = useLocation()
  if (status === 'loading' || status === 'unavailable')
    return (
      <main className="workspace-loading">
        <span className="wordmark">MindMesh</span>
        <h1>{status === 'loading' ? 'Opening your workspace.' : 'Connection unavailable.'}</h1>
        {status === 'unavailable' && (
          <>
            <p className="error" role="alert">
              The server could not be reached. Please try again.
            </p>
            <button className="button primary" onClick={() => void refresh()}>
              Try again
            </button>
          </>
        )}
      </main>
    )
  if (!user)
    return (
      <Navigate
        to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    )
  return (
    <WorkspaceProvider key={user.id}>
      <App />
    </WorkspaceProvider>
  )
}
