import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth/context'
import { useWorkspace } from '../state/store'
import { PageTitle } from '../components/UI'

type Conversation = { id: string; title: string }
type Message = { role: string; content: string }

export function Assistant() {
  const { csrfToken } = useAuth()
  const { state } = useWorkspace()
  const [configured, setConfigured] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [summary, setSummary] = useState<unknown>(null)
  const [share, setShare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [runs, setRuns] = useState<{ id: string; status: string; createdAt: string }[]>([])
  const [runId, setRunId] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      api<{ configured: boolean }>('assistant/status', { signal: controller.signal }),
      api<Conversation[]>('assistant/conversations', { signal: controller.signal }),
      api<typeof runs>('ml/runs', { signal: controller.signal }),
    ])
      .then(([status, saved, nextRuns]) => {
        if (controller.signal.aborted) return
        setConfigured(status.configured)
        setConversations(saved)
        setRuns(nextRuns)
      })
      .catch((issue) => {
        if (!controller.signal.aborted) setError(issue.message)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    if (conversationId)
      void api<Message[]>(`assistant/conversations/${conversationId}`, {
        signal: controller.signal,
      })
        .then((next) => {
          if (!controller.signal.aborted) setMessages(next)
        })
        .catch((issue) => {
          if (!controller.signal.aborted) setError(issue.message)
        })
    return () => controller.abort()
  }, [conversationId])

  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    controller.current = new AbortController()
    return () => controller.current?.abort()
  }, [])

  async function write<T>(path: string, body?: unknown, method = 'POST') {
    return api<T>(`assistant/${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'X-CSRF-Token': csrfToken ?? '' },
      signal: controller.current?.signal,
    })
  }

  async function send() {
    if (busy || !question.trim()) return
    setBusy(true)
    setError('')
    try {
      let id = conversationId
      if (!id) {
        const created = await write<Conversation>('conversations')
        id = created.id
        setConversationId(id)
        setConversations((current) => [created, ...current])
      }
      const answer = await write<Message>(`conversations/${id}/messages`, {
        message: question,
        shareContext: share,
        datasetId: share && datasetId ? datasetId : null,
        runId: share && runId ? runId : null,
      })
      setMessages((current) => [...current, { role: 'user', content: question }, answer])
      setQuestion('')
    } catch (issue) {
      if (!controller.current?.signal.aborted)
        setError(issue instanceof Error ? issue.message : 'Unable to send your question.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Ask MindMesh"
        title="Understand your next step."
        description="Ask about model choices, preparation, metrics, and limitations. The assistant cannot change your workspace."
      />
      {error && (
        <p role="alert" className="error my-5">
          {error}
        </p>
      )}
      {!configured && (
        <p className="notice my-5">
          The LLM assistant is not configured. The operator can set OPENAI_API_KEY and
          MINDMESH_LLM_MODEL on the server. Static help below remains available.
        </p>
      )}
      <section className="lab-panel">
        <label className="field lab-field">
          <span>Saved conversation</span>
          <select
            value={conversationId}
            disabled={busy}
            onChange={(e) => {
              setConversationId(e.target.value)
              setMessages([])
            }}
          >
            <option value="">New conversation</option>
            {conversations.map((c, index) => (
              <option key={c.id} value={c.id}>
                Conversation {conversations.length - index}
              </option>
            ))}
          </select>
        </label>
        <details className="advanced-settings">
          <summary>Optional context — review before sharing</summary>
          <p>
            Only column positions, types, missing counts, and selected run metrics are shared.
            Names, dataset rows, files, account details, and predictions are excluded.
          </p>
          <label className="field lab-field">
            <span>Dataset summary</span>
            <select
              disabled={busy}
              value={datasetId}
              onChange={(e) => {
                setDatasetId(e.target.value)
                setSummary(null)
                setShare(false)
              }}
            >
              <option value="">None</option>
              {state.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field lab-field">
            <span>Run metrics</span>
            <select
              disabled={busy}
              value={runId}
              onChange={(e) => {
                setRunId(e.target.value)
                setSummary(null)
                setShare(false)
              }}
            >
              <option value="">None</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.status} — {new Date(r.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={busy || (!datasetId && !runId)}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                setSummary(
                  await write('context', { datasetId: datasetId || null, runId: runId || null }),
                )
              } catch (issue) {
                setError(issue instanceof Error ? issue.message : 'Unable to load summary.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Preview summary
          </button>
          {summary !== null && (
            <>
              <pre className="context-preview">{JSON.stringify(summary, null, 2)}</pre>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={share}
                  onChange={(e) => setShare(e.target.checked)}
                />
                Send this summary with my next question
              </label>
            </>
          )}
        </details>
        <div aria-live="polite">
          {messages.map((m, i) => (
            <article className={`message ${m.role}`} key={i}>
              <strong>{m.role === 'user' ? 'You' : 'MindMesh · AI response'}</strong>
              <p className="assistant-message">{m.content}</p>
            </article>
          ))}
        </div>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label className="field">
            <span>Your question</span>
            <textarea
              value={question}
              maxLength={2000}
              required
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="How should I interpret precision and recall?"
            />
          </label>
          <p className="retention-note">
            Your question and the last three exchanges are sent to OpenAI. Avoid personal
            information. Conversations are saved privately in this account. AI answers may be wrong;
            check them against your measured results.
          </p>
          <button className="button primary" disabled={!configured || busy || !question.trim()}>
            {busy ? 'Waiting for response…' : 'Send question'}
          </button>
        </form>
        {conversationId && (
          <button
            className="text-link mt-6"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Permanently delete this conversation?')) return
              setBusy(true)
              try {
                await write(`conversations/${conversationId}`, undefined, 'DELETE')
                setConversations((current) => current.filter((c) => c.id !== conversationId))
                setConversationId('')
                setMessages([])
              } catch (issue) {
                setError(issue instanceof Error ? issue.message : 'Unable to delete conversation.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Delete conversation
          </button>
        )}
      </section>
      <section className="preparation-note">
        <strong>Static help — not an AI response</strong>
        <p>
          Classification predicts categories; regression predicts numbers. The target contains known
          answers. Features should be available before the answer is known. Empty inputs use
          preparation learned only from training rows. Compare held-out results with the simple
          baseline and check errors before reusing a model. Test scores do not guarantee future
          accuracy.
        </p>
      </section>
    </>
  )
}
