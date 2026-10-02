import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Arrow, Confirm, Empty, Modal, PageTitle } from '../components/UI'
import { useWorkspace } from '../state/store'
import type { Dataset } from '../state/types'

export function Datasets() {
  const { state, uploadDataset, assignDataset, deleteDataset } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheetOptions, setSheetOptions] = useState<string[]>([])
  const [sheetName, setSheetName] = useState('')
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
  function stopImport() {
    stopWorker()
    uploadController.current?.abort()
    uploadController.current = null
    fileRef.current = null
    setBusy(false)
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
    stopImport()
    setError('')
    setNotice('')
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
        const controller = new AbortController()
        uploadController.current = controller
        void uploadDataset(file, sheet, controller.signal)
          .then((dataset) => {
            if (controller.signal.aborted) return
            setParams({ dataset: dataset.id })
            setSheetOptions([])
            setNotice(`${dataset.name} imported. Assign it to a project below.`)
          })
          .catch((issue) => {
            if (!controller.signal.aborted)
              setError(issue instanceof Error ? issue.message : 'Unable to save this dataset.')
          })
          .finally(() => {
            if (uploadController.current === controller) {
              uploadController.current = null
              fileRef.current = null
              setBusy(false)
            }
          })
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
                    DATA
                  </span>
                  <span>
                    <span className="dataset-name">{dataset.name}</span>
                    <span className="dataset-meta">
                      {dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns ·{' '}
                      {state.projects.find((p) => p.id === dataset.projectId)?.name ?? 'Unassigned'}
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
            {busy ? 'Reading your dataset…' : 'Drop a little possibility here.'}
          </p>
          <p>CSV or XLSX · Up to 5 MB, 20,000 rows, 100 columns</p>
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
          <button className="button" onClick={stopImport}>
            Cancel import
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
      {error && (
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
              <p className="eyebrow muted mb-3">Dataset preview</p>
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
                        {column.type} · {column.missing} missing
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
            {selected.hasFile
              ? ' original file is saved to your account.'
              : ' original file was not part of this browser-only import. Upload it again to retain the complete dataset.'}
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
            stopImport()
            setSheetOptions([])
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
            {busy ? 'Reading…' : 'Import worksheet'}
          </button>
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
