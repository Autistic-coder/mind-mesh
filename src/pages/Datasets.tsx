import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Arrow, Confirm, Empty, Modal, PageTitle } from '../components/UI'
import { useWorkspace } from '../state/store'
import type { Dataset } from '../state/types'

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uploadDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function Datasets() {
  const { state, uploadDataset, assignDataset, deleteDataset } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheetOptions, setSheetOptions] = useState<string[]>([])
  const [sheetName, setSheetName] = useState('')
  const [draft, setDraft] = useState<Dataset | null>(null)
  const requestedProject = params.get('project')
  const [draftProjectId, setDraftProjectId] = useState(
    state.projects.some((project) => project.id === requestedProject) ? requestedProject! : '',
  )
  const [removing, setRemoving] = useState<Dataset | null>(null)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<File | null>(null)
  const worker = useRef<Worker | null>(null)
  const uploadController = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = state.datasets.find((dataset) => dataset.id === params.get('dataset'))

  function stopWorker() {
    worker.current?.terminate()
    worker.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  function stopWork() {
    stopWorker()
    uploadController.current?.abort()
    uploadController.current = null
    setBusy(false)
  }
  function clearDraft() {
    stopWork()
    fileRef.current = null
    setDraft(null)
    setSheetOptions([])
    setSheetName('')
  }
  useEffect(
    () => () => {
      worker.current?.terminate()
      uploadController.current?.abort()
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function importFile(file: File, sheet?: string) {
    stopWork()
    setError('')
    setNotice('')
    setDraft(null)
    setBusy(true)
    fileRef.current = file
    const parser = new Worker(new URL('../data/import.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.current = parser
    parser.onmessage = (
      event: MessageEvent<{ dataset?: Dataset; sheets?: string[]; error?: string }>,
    ) => {
      if (worker.current !== parser) return
      stopWorker()
      if (event.data.error) {
        setBusy(false)
        setError(event.data.error)
        return
      }
      if (event.data.sheets) {
        setBusy(false)
        setSheetOptions(event.data.sheets)
        setSheetName(event.data.sheets[0])
        return
      }
      if (event.data.dataset) {
        setDraft(event.data.dataset)
        setSheetOptions([])
        setBusy(false)
      }
    }
    parser.onerror = () => {
      stopWorker()
      setBusy(false)
      setError('The file could not be parsed. Check its format or try exporting it again.')
    }
    timer.current = setTimeout(() => {
      stopWorker()
      setBusy(false)
      setError('Parsing took too long. Try a smaller or simpler file.')
    }, 20_000)
    parser.postMessage({ file, sheetName: sheet })
  }

  async function confirmUpload() {
    const file = fileRef.current
    if (!file || !draft || busy) return
    const controller = new AbortController()
    uploadController.current = controller
    setBusy(true)
    setError('')
    try {
      const dataset = await uploadDataset(
        file,
        sheetName || undefined,
        draftProjectId || null,
        controller.signal,
      )
      if (controller.signal.aborted) return
      clearDraft()
      setParams({ dataset: dataset.id })
      setNotice(`${dataset.name} was saved to your private workspace.`)
    } catch (issue) {
      if (!controller.signal.aborted)
        setError(issue instanceof Error ? issue.message : 'Unable to save this dataset.')
    } finally {
      if (uploadController.current === controller) {
        uploadController.current = null
        setBusy(false)
      }
    }
  }

  function list() {
    const datasets = state.datasets
    return (
      <section>
        <div className="section-heading">
          <h2>
            Your datasets <span className="count-inline">{datasets.length}</span>
          </h2>
          <span className="badge upload">Private workspace</span>
        </div>
        {datasets.length ? (
          <div className="dataset-list">
            {datasets.map((dataset) => (
              <div
                className={`dataset-row ${selected?.id === dataset.id ? 'selected' : ''}`}
                key={dataset.id}
              >
                <button
                  className="dataset-open"
                  onClick={() => setParams({ dataset: dataset.id })}
                  aria-pressed={selected?.id === dataset.id}
                >
                  <span className="file-mark" aria-hidden="true">
                    {dataset.storageStatus === 'preview-only'
                      ? 'VIEW'
                      : (dataset.fileFormat ?? 'DATA')}
                  </span>
                  <span>
                    <span className="dataset-name">{dataset.name}</span>
                    <span className="dataset-meta">
                      {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns ·{' '}
                      {state.projects.find((p) => p.id === dataset.projectId)?.name ?? 'Unassigned'}
                      {dataset.storageStatus === 'preview-only' && ' · Preview only'}
                      {dataset.storageStatus === 'missing' && ' · Original unavailable'}
                    </span>
                  </span>
                  <Arrow />
                </button>
                <button
                  className="icon-button remove-dataset"
                  aria-label={`Remove ${dataset.name}`}
                  onClick={() => setRemoving(dataset)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="quiet-empty">
            Your data belongs here. Upload your first CSV or workbook above.
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <PageTitle
        eyebrow="A good place to begin"
        title="Meet your data."
        description="Bring a dataset, find a question, and see where it takes you."
      />
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files.length !== 1) {
            setError('Upload one file at a time.')
            return
          }
          setSheetOptions([])
          importFile(e.dataTransfer.files[0])
        }}
      >
        <div>
          <p className="upload-title">
            {busy ? 'Processing your dataset…' : 'Drop a little possibility here.'}
          </p>
          <p>CSV or XLSX · Up to 25 MB, 200,000 rows, 10,000 columns</p>
        </div>
        <input
          hidden
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          aria-label="Upload dataset"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              setSheetOptions([])
              importFile(e.target.files[0])
            }
            e.target.value = ''
          }}
        />
        {busy ? (
          <button className="button" onClick={clearDraft}>
            Cancel
          </button>
        ) : (
          <button className="button" onClick={() => inputRef.current?.click()}>
            Choose a file <Arrow diagonal />
          </button>
        )}
      </div>
      <p className="retention-note">
        Complete files are saved to your account. Previews show up to 25 rows.
      </p>
      {error && !draft && sheetOptions.length === 0 && (
        <p className="error my-5" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice my-5" role="status">
          {notice}
        </p>
      )}
      <div className="dataset-sections">{list()}</div>
      {selected && (
        <section className="dataset-preview" aria-label="Dataset details">
          <div className="section-heading">
            <div>
              <p className="eyebrow muted mb-3">
                {selected.storageStatus === 'preview-only' ? 'Imported preview' : 'Saved dataset'}
              </p>
              <h2>{selected.name}</h2>
            </div>
            <div className="flex flex-wrap gap-5">
              {selected.hasFile && (
                <a
                  className="text-link"
                  href={`/api/datasets/${encodeURIComponent(selected.id)}/download`}
                >
                  Download original
                </a>
              )}
              <button className="text-link" onClick={() => setParams({})}>
                Close preview
              </button>
            </div>
          </div>
          {selected.storageStatus === 'preview-only' && (
            <div className="dataset-source-note preview-only" role="note">
              <strong>Preview-only record</strong>
              <span>
                This came from older browser storage, which did not contain the original file.
                Re-upload the CSV or XLSX file to save and inspect the complete dataset.
              </span>
            </div>
          )}
          {selected.storageStatus === 'missing' && (
            <div className="dataset-source-note missing-file" role="alert">
              <strong>Original file unavailable</strong>
              <span>
                The saved summary remains visible, but the original file cannot currently be
                downloaded. Upload the source file again to create a complete record.
              </span>
            </div>
          )}
          <dl className="dataset-facts" aria-label="Dataset information">
            <div>
              <dt>Display name</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt>Original filename</dt>
              <dd>{selected.originalFilename ?? 'Not retained'}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{selected.fileFormat ?? 'Preview only'}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{selected.sizeBytes == null ? 'Not retained' : fileSize(selected.sizeBytes)}</dd>
            </div>
            <div>
              <dt>Worksheet</dt>
              <dd>{selected.sheetName ?? 'Not applicable'}</dd>
            </div>
            <div>
              <dt>Uploaded</dt>
              <dd>{uploadDate(selected.createdAt)}</dd>
            </div>
          </dl>
          <div className="preview-summary">
            <p>
              {selected.rowCount.toLocaleString()} rows <span> / </span>
              {selected.columns.length} columns <span> / </span>
              {selected.columns.reduce((sum, column) => sum + column.missing, 0)} missing cells
            </p>
            <label className="field select-field">
              <span>Assign to project</span>
              <select
                value={selected.projectId ?? ''}
                disabled={assigning}
                onChange={async (e) => {
                  setAssigning(true)
                  setError('')
                  try {
                    await assignDataset(selected.id, e.target.value || null)
                  } catch (issue) {
                    setError(issue instanceof Error ? issue.message : 'Unable to assign dataset.')
                  } finally {
                    setAssigning(false)
                  }
                }}
              >
                <option value="">Unassigned</option>
                {state.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap preview-table">
            <table>
              <thead>
                <tr>
                  {selected.columns.map((column) => (
                    <th key={column.name}>
                      {column.name}
                      <span className="column-info">
                        {column.type} · {column.missing.toLocaleString()} missing ·{' '}
                        {column.uniqueCountCapped ? '30+' : column.uniqueCount.toLocaleString()}{' '}
                        unique
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.preview.slice(0, 10).map((row, index) => (
                  <tr key={index}>
                    {row.map((value, i) => (
                      <td key={i}>{value === '' ? <span className="muted">—</span> : value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="retention-note">
            Showing {Math.min(selected.preview.length, 10)} of {selected.rowCount} rows. The
            {selected.storageStatus === 'complete'
              ? ' original file is saved to your account.'
              : selected.storageStatus === 'missing'
                ? ' saved summary is available, but the original file is missing.'
                : ' original file was not part of this browser-only import.'}
          </p>
        </section>
      )}
      {params.has('dataset') && !selected && (
        <Empty title="Dataset not found">
          This dataset may have been removed. Choose another dataset above.
        </Empty>
      )}
      {sheetOptions.length > 0 && (
        <Modal
          title="Choose a worksheet"
          onClose={() => {
            clearDraft()
          }}
        >
          <p className="muted my-5 text-sm">
            This workbook has multiple sheets. Import one dataset at a time.
          </p>
          <label className="field select-field">
            <span>Worksheet</span>
            <select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
              {sheetOptions.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {error && (
            <p className="error mt-5" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary mt-6"
            disabled={busy}
            onClick={() => fileRef.current && importFile(fileRef.current, sheetName)}
          >
            {busy ? 'Reading…' : 'Review worksheet'}
          </button>
        </Modal>
      )}
      {draft && fileRef.current && (
        <Modal title="Review dataset" onClose={clearDraft}>
          <p className="muted my-5 text-sm">
            Check this bounded browser preview before the server validates and saves the complete
            original file.
          </p>
          <dl className="upload-review-summary">
            <div>
              <dt>Original file</dt>
              <dd>{fileRef.current.name}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{fileSize(fileRef.current.size)}</dd>
            </div>
            {sheetName && (
              <div>
                <dt>Worksheet</dt>
                <dd>{sheetName}</dd>
              </div>
            )}
            <div>
              <dt>Detected shape</dt>
              <dd>
                {draft.rowCount.toLocaleString()} rows · {draft.columns.length.toLocaleString()}{' '}
                columns
              </dd>
            </div>
          </dl>
          <label className="field select-field mt-5">
            <span>Project (optional)</span>
            <select
              value={draftProjectId}
              disabled={busy}
              onChange={(event) => setDraftProjectId(event.target.value)}
            >
              <option value="">Unassigned</option>
              {state.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="table-wrap upload-review-table mt-6">
            <table>
              <thead>
                <tr>
                  {draft.columns.map((column) => (
                    <th key={column.name}>{column.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.preview.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {row.map((value, cellIndex) => (
                      <td key={cellIndex}>
                        {value === '' ? <span className="muted">—</span> : value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="retention-note">
            Previewing {Math.min(5, draft.preview.length)} rows. The backend will calculate and
            store the authoritative summary from the complete selected dataset.
          </p>
          {error && (
            <p className="error mt-5" role="alert">
              {error}
            </p>
          )}
          <div className="upload-review-actions">
            <button className="button" disabled={busy} onClick={clearDraft}>
              Cancel
            </button>
            <button className="button primary" disabled={busy} onClick={confirmUpload}>
              {busy ? 'Uploading and processing…' : 'Save dataset'}
            </button>
          </div>
        </Modal>
      )}
      {removing && (
        <Confirm
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove dataset"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (deleting) return
            setDeleting(true)
            setError('')
            try {
              await deleteDataset(removing.id)
              if (selected?.id === removing.id) setParams({})
              setRemoving(null)
              setNotice('Dataset removed.')
            } catch (issue) {
              setError(issue instanceof Error ? issue.message : 'Unable to remove dataset.')
            } finally {
              setDeleting(false)
            }
          }}
        >
          This removes its preview, project assignment, and stored file from your account.
          {error && (
            <span className="error block mt-4" role="alert">
              {error}
            </span>
          )}
        </Confirm>
      )}
    </>
  )
}
