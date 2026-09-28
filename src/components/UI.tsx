import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true" className="arrow">{diagonal ? '↗' : '→'}</span>
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-title"><p className="eyebrow">{eyebrow}</p><div className="flex flex-wrap items-end justify-between gap-5"><div><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div></header>
}

export function Empty({ title, children, to, action }: { title: string; children: ReactNode; to?: string; action?: string }) {
  return <div className="empty"><span className="empty-mark" aria-hidden="true">↗</span><h2>{title}</h2><p>{children}</p>{to && <Link className="button mt-6" to={to}>{action}<Arrow /></Link>}</div>
}

export function DemoNote({ children }: { children?: ReactNode }) {
  return <div className="demo-note"><span className="badge">Demo workspace</span><p>{children ?? 'Synthetic data. Explore the workflow; no real models are trained.'}</p></div>
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    const priorOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = priorOverflow; previous?.focus() }
  }, [])
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="dialog-content"><div className="flex items-start justify-between gap-6"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>{children}</div></dialog>
}

export function Confirm({ title, children, confirmLabel, onConfirm, onClose }: { title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  return <Modal title={title} onClose={onClose}><p className="muted my-6">{children}</p><div className="flex justify-end gap-3"><button className="button" onClick={onClose} autoFocus>Cancel</button><button className="button danger" onClick={onConfirm}>{confirmLabel}</button></div></Modal>
}
