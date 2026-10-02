import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/store'
import { Arrow, Modal } from './UI'

export function ProjectForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { createProject } = useWorkspace()
  const navigate = useNavigate()
  return (
    <Modal title="Make room for an idea." onClose={onClose}>
      <p className="muted my-5 text-sm">Start a project, bring in your data, and explore.</p>
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || busy) return
          setError('')
          setBusy(true)
          try {
            const project = await createProject(name.trim(), description.trim())
            onClose()
            navigate(`/projects/${project.id}`)
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'Unable to create project.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="field">
          <span>Project name</span>
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What are you working on?"
          />
        </label>
        <label className="field">
          <span>
            Description <span className="muted font-normal">(optional)</span>
          </span>
          <textarea
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A few words about your question or goal…"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 mt-3">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create project'} <Arrow diagonal />
          </button>
        </div>
      </form>
    </Modal>
  )
}
