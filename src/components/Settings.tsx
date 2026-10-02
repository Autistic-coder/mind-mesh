import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/store'
import { Confirm, Modal } from './UI'

export function Settings({ onClose }: { onClose: () => void }) {
  const { state, updateName, resetWorkspace } = useWorkspace()
  const [name, setName] = useState(state.displayName)
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  if (reset)
    return (
      <Confirm
        title="Reset your workspace?"
        confirmLabel="Reset workspace"
        onClose={() => setReset(false)}
        onConfirm={async () => {
          if (busy) return
          setBusy(true)
          setError('')
          try {
            await resetWorkspace()
            navigate('/')
            onClose()
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'Unable to reset workspace.')
            setBusy(false)
          }
        }}
      >
        This removes your projects and uploaded datasets, including their stored files, from this
        account.
        {error && (
          <span className="error block mt-4" role="alert">
            {error}
          </span>
        )}
      </Confirm>
    )
  return (
    <Modal title="Your workspace" onClose={onClose}>
      <p className="muted my-5 text-sm">
        Projects and complete uploaded datasets are saved to your account.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || busy) return
          setBusy(true)
          setError('')
          try {
            await updateName(name.trim())
            onClose()
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'Unable to update your name.')
            setBusy(false)
          }
        }}
      >
        <label className="field">
          <span>Display name</span>
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        {error && (
          <p className="error mt-5" role="alert">
            {error}
          </p>
        )}
        <button className="button primary mt-5" disabled={!name.trim() || busy}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
      </form>
      <div className="mt-9 border-t border-[#d0cec5] pt-6">
        <p className="muted mb-4 text-sm">View your account details or sign out.</p>
        <Link className="button mb-6" to="/account" onClick={onClose}>
          Account settings
        </Link>
      </div>
      <div className="border-t border-[#d0cec5] pt-6">
        <p className="muted mb-4 text-sm">Start over with an empty workspace.</p>
        <button className="button danger" onClick={() => setReset(true)}>
          Reset workspace
        </button>
      </div>
    </Modal>
  )
}
