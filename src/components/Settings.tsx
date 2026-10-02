import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadWorkspace, STORAGE_KEY } from '../state/persistence'
import { useWorkspace } from '../state/store'
import type { Workspace } from '../state/types'
import { Confirm, Modal } from './UI'

export function Settings({ onClose }: { onClose: () => void }) {
  const { state, updateName, importLegacy, resetWorkspace } = useWorkspace()
  const [name, setName] = useState(state.displayName)
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [legacyError, setLegacyError] = useState('')
  const [notice, setNotice] = useState('')
  const [legacy, setLegacy] = useState<Workspace | null>(null)
  const navigate = useNavigate()
  function inspectLegacy() {
    setLegacyError('')
    setNotice('')
    try {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        setNotice('No older browser workspace was found on this device and origin.')
        return
      }
      const result = loadWorkspace(localStorage)
      if (result.blocked) {
        setLegacyError(
          'The old browser data could not be read. Export a copy before making changes.',
        )
        return
      }
      if (!result.state.projects.length && !result.state.datasets.length) {
        setNotice('This browser copy has no personal projects or datasets to import.')
        return
      }
      setLegacy(result.state)
    } catch {
      setLegacyError('Browser storage is unavailable. Try another browser profile or device.')
    }
  }
  function exportLegacy() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === null) {
        setNotice('No older browser workspace was found on this device and origin.')
        return
      }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'mindmesh-browser-workspace.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(
        'A copy of the original browser data was downloaded. The browser copy remains intact.',
      )
    } catch {
      setLegacyError('Browser storage is unavailable. Unable to export the old workspace.')
    }
  }
  if (legacy)
    return (
      <Confirm
        title="Import browser workspace?"
        confirmLabel={busy ? 'Importing…' : 'Import into this account'}
        onClose={() => setLegacy(null)}
        onConfirm={async () => {
          if (busy) return
          setBusy(true)
          setError('')
          try {
            const result = await importLegacy({
              ...legacy,
              projects: legacy.projects.map(({ id, name, description, updatedAt }) => ({
                id,
                name,
                description,
                updatedAt,
              })),
              datasets: legacy.datasets.map(
                ({ id, name, projectId, columns, rowCount, preview, createdAt }) => ({
                  id,
                  name,
                  projectId,
                  columns,
                  rowCount,
                  preview,
                  createdAt,
                }),
              ),
            })
            setLegacy(null)
            setNotice(
              `Imported ${result.projectsImported} projects and ${result.datasetsImported} dataset previews. The browser copy remains intact.`,
            )
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : 'Unable to import browser workspace.')
          } finally {
            setBusy(false)
          }
        }}
      >
        This copies {legacy.projects.length} projects and {legacy.datasets.length} dataset previews
        into this signed-in account. Old browser data never included complete uploaded files. The
        original browser copy will remain in place.
        {error && (
          <span className="error block mt-4" role="alert">
            {error}
          </span>
        )}
      </Confirm>
    )
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
        <h3 className="settings-section-title">Older browser workspace</h3>
        <p className="muted mb-4 text-sm">
          Import older personal projects and dataset previews only when you choose. Complete
          original files were not saved in browser storage.
        </p>
        <div className="settings-actions">
          <button className="button" type="button" onClick={inspectLegacy}>
            Review browser copy
          </button>
          <button className="button" type="button" onClick={exportLegacy}>
            Export browser copy
          </button>
        </div>
        {notice && (
          <p className="notice mt-4" role="status">
            {notice}
          </p>
        )}
        {legacyError && (
          <p className="error mt-4" role="alert">
            {legacyError}
          </p>
        )}
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
