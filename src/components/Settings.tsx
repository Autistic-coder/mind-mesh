import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/store'
import { Confirm, Modal } from './UI'

export function Settings({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useWorkspace()
  const [name, setName] = useState(state.displayName)
  const [reset, setReset] = useState(false)
  const navigate = useNavigate()
  if (reset)
    return (
      <Confirm
        title="Reset local workspace?"
        confirmLabel="Reset workspace"
        onClose={() => setReset(false)}
        onConfirm={() => {
          dispatch({ type: 'reset' })
          navigate('/')
          onClose()
        }}
      >
        This removes your uploads, custom projects, generated models, and chat history from this
        browser, and restores the three original demo projects.
      </Confirm>
    )
  return (
    <Modal title="Your workspace" onClose={onClose}>
      <p className="muted my-5 text-sm">
        A local demo, saved in this browser. No account required.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) {
            dispatch({ type: 'profile', name: name.trim() })
            onClose()
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
        <button className="button primary mt-5" disabled={!name.trim()}>
          Save name
        </button>
      </form>
      <div className="mt-9 border-t border-[#d0cec5] pt-6">
        <p className="muted mb-4 text-sm">Start over with a fresh set of synthetic examples.</p>
        <button className="button danger" onClick={() => setReset(true)}>
          Reset local workspace
        </button>
      </div>
    </Modal>
  )
}
