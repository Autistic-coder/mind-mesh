import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Arrow, Confirm, PageTitle } from '../components/UI'
import { sampleResponse, suggestions } from '../data/chat'
import { useWorkspace } from '../state/store'

export function Ask() {
  const { state, dispatch } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [question, setQuestion] = useState(params.get('q') ?? '')
  const [error, setError] = useState('')
  const [clear, setClear] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const lastResponse = useRef<HTMLElement>(null)
  const submitted = useRef(false)
  useEffect(() => {
    if (params.get('q')) input.current?.focus()
  }, [params])
  useEffect(() => {
    if (submitted.current) {
      lastResponse.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      submitted.current = false
    }
  }, [state.messages.length])
  function send() {
    const content = question.trim()
    if (!content) {
      setError('Write a question before sending.')
      input.current?.focus()
      return
    }
    if (content.length > 2000) {
      setError('Keep your question within 2,000 characters.')
      return
    }
    const createdAt = new Date().toISOString()
    dispatch({
      type: 'messages/add',
      messages: [
        { id: crypto.randomUUID(), role: 'user', content, demo: false, createdAt },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: sampleResponse(content),
          demo: true,
          createdAt,
        },
      ],
    })
    submitted.current = true
    setQuestion('')
    setError('')
    setParams({}, { replace: true })
    input.current?.focus()
  }
  return (
    <div className="ask-page">
      <PageTitle
        eyebrow="A space to think out loud"
        title="Ask MindMesh."
        description="A question is a good place to start."
        action={
          state.messages.length > 0 ? (
            <button className="text-link" onClick={() => setClear(true)}>
              Clear conversation
            </button>
          ) : undefined
        }
      />
      <div className="assistant-notice">
        <span className="status-dot" />
        <p>
          <strong>Sample responses only.</strong> No LLM is connected. Your questions stay in this
          browser.
        </p>
      </div>
      {state.messages.length === 0 ? (
        <section className="chat-intro">
          <span className="chat-symbol" aria-hidden="true">
            ✳
          </span>
          <h2>What’s on your mind?</h2>
          <p>
            Explore a dataset. Understand a metric.
            <br />
            Find a new way to ask your question.
          </p>
          <div className="suggestions">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                onClick={() => {
                  setQuestion(suggestion)
                  setError('')
                  input.current?.focus()
                }}
              >
                <span className="suggestion-number">0{index + 1}</span>
                <span>{suggestion}</span>
                <Arrow diagonal />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section
          className="transcript"
          aria-label="Conversation"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {state.messages.map((message, index) => (
            <article
              key={message.id}
              className={`message ${message.role}`}
              ref={index === state.messages.length - 1 ? lastResponse : undefined}
            >
              <div className="message-heading">
                <p className="eyebrow">
                  {message.role === 'user' ? state.displayName : 'MindMesh'}
                  {message.role === 'assistant' && <span className="badge">Sample response</span>}
                </p>
                <time dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <div className="message-content">
                {message.content.split('\n\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <label htmlFor="chat-question" className="eyebrow muted block mb-3">
          Your question
        </label>
        <div className="chat-input">
          <textarea
            ref={input}
            id="chat-question"
            value={question}
            maxLength={2000}
            placeholder="Ask about a dataset, model, or metric…"
            onChange={(e) => {
              setQuestion(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'chat-error' : 'chat-help'}
          />
          <button className="button primary" type="submit">
            Send <Arrow diagonal />
          </button>
        </div>
        {error && (
          <p className="field-error mt-3" id="chat-error" role="alert">
            {error}
          </p>
        )}
        <div className="composer-footer" id="chat-help">
          <p>Enter to send · Shift + Enter for a new line</p>
          <p>{question.length} / 2,000</p>
        </div>
        <p className="retention-note">
          Locally written examples, not AI-generated answers. The latest 100 messages are saved.
        </p>
      </form>
      {clear && (
        <Confirm
          title="Clear this conversation?"
          confirmLabel="Clear conversation"
          onClose={() => setClear(false)}
          onConfirm={() => {
            dispatch({ type: 'messages/clear' })
            setClear(false)
          }}
        >
          This removes all chat messages from this browser. Projects, datasets, and models are kept.
        </Confirm>
      )}
    </div>
  )
}
