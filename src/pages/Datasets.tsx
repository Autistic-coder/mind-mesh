import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Arrow, Confirm, DemoNote, Empty, Modal, PageTitle } from '../components/UI'
import { useWorkspace } from '../state/store'
import type { Dataset } from '../state/types'

export function Datasets() {
  const { state, dispatch } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheetOptions, setSheetOptions] = useState<string[]>([])
  const [sheetName, setSheetName] = useState('')
  const [removing, setRemoving] = useState<Dataset | null>(null)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<File | null>(null)
  const worker = useRef<Worker | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = state.datasets.find(dataset => dataset.id === params.get('dataset'))

  function stopImport() { worker.current?.terminate(); worker.current = null; if (timer.current) clearTimeout(timer.current); setBusy(false) }
  useEffect(() => () => { worker.current?.terminate(); if (timer.current) clearTimeout(timer.current) }, [])

  function importFile(file: File, sheet?: string) {
    stopImport(); setError(''); setNotice(''); setBusy(true); fileRef.current = file
    const parser = new Worker(new URL('../data/import.worker.ts', import.meta.url), { type: 'module' })
    worker.current = parser
    parser.onmessage = (event: MessageEvent<{ dataset?: Dataset; sheets?: string[]; error?: string }>) => {
      stopImport()
      if (event.data.error) { setError(event.data.error); return }
      if (event.data.sheets) { setSheetOptions(event.data.sheets); setSheetName(event.data.sheets[0]); return }
      if (event.data.dataset) {
        dispatch({ type: 'dataset/add', dataset: event.data.dataset })
        setParams({ dataset: event.data.dataset.id }); setSheetOptions([])
        setNotice(`${event.data.dataset.name} imported. Assign it to a project below to explore training.`)
      }
    }
    parser.onerror = () => { stopImport(); setError('The file could not be parsed. Check its format or try exporting it again.') }
    timer.current = setTimeout(() => { stopImport(); setError('Parsing took too long. Try a smaller or simpler file.') }, 20_000)
    parser.postMessage({ file, sheetName: sheet })
  }

  function list(source: Dataset['source']) {
    const datasets = state.datasets.filter(dataset => dataset.source === source)
    return <section><div className="section-heading"><h2>{source === 'synthetic' ? 'Demo datasets' : 'Your uploads'} <span className="count-inline">{datasets.length}</span></h2><span className={`badge ${source === 'uploaded' ? 'upload' : ''}`}>{source === 'synthetic' ? 'Synthetic examples' : 'Stored locally'}</span></div>{datasets.length ? <div className="dataset-list">{datasets.map(dataset => <div className={`dataset-row ${selected?.id === dataset.id ? 'selected' : ''}`} key={dataset.id}><button className="dataset-open" onClick={() => setParams({ dataset: dataset.id })} aria-pressed={selected?.id === dataset.id}><span className="file-mark" aria-hidden="true">{source === 'synthetic' ? 'DEMO' : 'DATA'}</span><span><span className="dataset-name">{dataset.name}</span><span className="dataset-meta">{dataset.rowCount.toLocaleString()} rows · {dataset.columns.length} columns · {state.projects.find(p => p.id === dataset.projectId)?.name ?? 'Unassigned'}</span></span><Arrow /></button><button className="icon-button remove-dataset" aria-label={`Remove ${dataset.name}`} onClick={() => setRemoving(dataset)}>×</button></div>)}</div> : <div className="quiet-empty">{source === 'uploaded' ? 'Your data belongs here. Upload your first CSV or workbook above.' : 'No demo datasets. Restore the original examples in workspace settings.'}</div>}</section>
  }

  return <><PageTitle eyebrow="A good place to begin" title="Meet your data." description="Bring a dataset, find a question, and see where it takes you." /><div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length !== 1) { setError('Upload one file at a time.'); return } setSheetOptions([]); importFile(e.dataTransfer.files[0]) }}><div><p className="upload-title">{busy ? 'Reading your dataset…' : 'Drop a little possibility here.'}</p><p>CSV or XLSX · Up to 5 MB, 20,000 rows, 100 columns</p></div><input className="sr-only" ref={inputRef} type="file" accept=".csv,.xlsx" aria-label="Upload dataset" onChange={e => { if (e.target.files?.[0]) { setSheetOptions([]); importFile(e.target.files[0]) } e.target.value = '' }} />{busy ? <button className="button" onClick={stopImport}>Cancel import</button> : <button className="button" onClick={() => inputRef.current?.click()}>Choose a file <Arrow diagonal /></button>}</div><p className="retention-note">Files stay in your browser. Only the schema, row count, and up to 25 preview rows are saved; full files are not retained.</p>{error && <p className="error my-5" role="alert">{error}</p>}{notice && <p className="notice my-5" role="status">{notice}</p>}<div className="dataset-sections">{list('uploaded')}{list('synthetic')}</div>{selected && <section className="dataset-preview" aria-label="Dataset details"><div className="section-heading"><div><p className="eyebrow muted mb-3">Dataset preview</p><h2>{selected.name}</h2></div><button className="text-link" onClick={() => setParams({})}>Close preview</button></div><div className="preview-summary"><p>{selected.rowCount.toLocaleString()} rows <span> / </span>{selected.columns.length} columns <span> / </span>{selected.columns.reduce((sum, column) => sum + column.missing, 0)} missing cells</p><label className="field"><span>Assign to project</span><select value={selected.projectId ?? ''} onChange={e => dispatch({ type: 'dataset/assign', id: selected.id, projectId: e.target.value || null })}><option value="">Unassigned</option>{state.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><div className="table-wrap preview-table"><table><thead><tr>{selected.columns.map(column => <th key={column.name}>{column.name}<span className="column-info">{column.type} · {column.missing} missing</span></th>)}</tr></thead><tbody>{selected.preview.slice(0, 10).map((row, index) => <tr key={index}>{row.map((value, i) => <td key={i}>{value === '' ? <span className="muted">—</span> : value}</td>)}</tr>)}</tbody></table></div><p className="retention-note">Showing {Math.min(selected.preview.length, 10)} of {selected.rowCount} rows. {selected.source === 'synthetic' ? 'Clearly synthetic demo data.' : 'User-uploaded data; never sent to a server.'}</p></section>}{params.has('dataset') && !selected && <Empty title="Dataset not found">This dataset may have been removed. Choose another dataset above.</Empty>}<DemoNote />{sheetOptions.length > 0 && <Modal title="Choose a worksheet" onClose={() => { stopImport(); setSheetOptions([]) }}><p className="muted my-5 text-sm">This workbook has multiple sheets. Import one dataset at a time.</p><label className="field"><span>Worksheet</span><select value={sheetName} onChange={e => setSheetName(e.target.value)}>{sheetOptions.map(name => <option key={name}>{name}</option>)}</select></label>{error && <p className="error mt-5" role="alert">{error}</p>}<button className="button primary mt-6" disabled={busy} onClick={() => fileRef.current && importFile(fileRef.current, sheetName)}>{busy ? 'Reading…' : 'Import worksheet'}</button></Modal>}{removing && <Confirm title={`Remove ${removing.name}?`} confirmLabel="Remove dataset" onClose={() => setRemoving(null)} onConfirm={() => { dispatch({ type: 'dataset/delete', id: removing.id }); if (selected?.id === removing.id) setParams({}); setRemoving(null); setNotice('Dataset removed. Existing demo models keep their saved feature schemas.') }}>This removes its saved preview and project assignment. Existing demo models remain usable with their saved schemas; they will show that the source dataset was removed.</Confirm>}</>
}
