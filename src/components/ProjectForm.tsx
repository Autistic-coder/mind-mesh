import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../state/store'
import { Arrow, Modal } from './UI'

export function ProjectForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { dispatch } = useWorkspace()
  const navigate = useNavigate()
  return (
    <Modal title="Make room for an idea." onClose={onClose}>
      <p className="muted my-5 text-sm">Start a project, bring in your data, and explore.</p>
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          const id = crypto.randomUUID()
          dispatch({
            type: 'project/add',
            project: {
              id,
              name: name.trim(),
              description: description.trim(),
              demo: false,
              updatedAt: new Date().toISOString(),
            },
          })
          onClose()
          navigate(`/projects/${id}`)
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
        <div className="flex justify-end gap-3 mt-3">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!name.trim()}>
            Create project <Arrow diagonal />
          </button>
        </div>
      </form>
    </Modal>
  )
}
