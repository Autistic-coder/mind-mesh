import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './context'

function destination(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/sign-in') || value.startsWith('/register')) return '/'
  return value
}

function AuthFrame({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string
  title: string
  intro: string
  children?: ReactNode
}) {
  useEffect(() => {
    document.title = `MindMesh · ${title}`
  }, [title])
  return (
    <div className="auth-layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="auth-identity">
        <Link className="wordmark" to="/">
          MindMesh
        </Link>
        <div className="auth-identity-copy">
          <p className="eyebrow">A quieter place to think</p>
          <p>Where an idea finds its shape.</p>
          <span className="auth-rule" aria-hidden="true" />
          <small>Projects, data, and questions, in one considered space.</small>
        </div>
        <span className="auth-identity-foot">MINDMESH / YOUR WORKSPACE</span>
      </aside>
      <main id="main" className="auth-main" tabIndex={-1}>
        <div className="auth-panel">
          <p className="eyebrow muted">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-intro">{intro}</p>
          {children}
        </div>
      </main>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  name,
  minLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  name: string
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={128}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible(!visible)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

export function SignIn() {
  const { signIn, status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = destination(params.get('next'))
  const nextQuery = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') navigate(next, { replace: true })
  }, [status, navigate, next])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
      navigate(next, { replace: true })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Sign in."
      intro="Pick up where your thoughts left off."
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="sign-in-email">Email address</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
        </div>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status === 'unavailable' && !error && (
          <p className="error" role="alert">
            The server is unavailable. Please try again in a moment.
          </p>
        )}
        <button className="button primary auth-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span>
        </button>
      </form>
      <p className="auth-switch">
        New to MindMesh? <Link to={`/register${nextQuery}`}>Create an account</Link>
      </p>
    </AuthFrame>
  )
}

export function Register() {
  const { register, status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = destination(params.get('next'))
  const nextQuery = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') navigate(next, { replace: true })
  }, [status, navigate, next])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await register(name, email, password, confirmation)
      navigate(next, { replace: true })
    } catch (issue) {
      setError(
        issue instanceof Error ? issue.message : 'Unable to create your account. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="Begin here"
      title="Create an account."
      intro="A place for the projects and questions you want to keep."
    >
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="register-name">Display name</label>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>
        <div className="auth-field">
          <label htmlFor="register-email">Email address</label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          minLength={12}
        />
        <p className="auth-hint">Use 12–128 characters. A passphrase works well.</p>
        <PasswordField
          label="Confirm password"
          name="password-confirmation"
          autoComplete="new-password"
          value={confirmation}
          onChange={setConfirmation}
          minLength={12}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status === 'unavailable' && !error && (
          <p className="error" role="alert">
            The server is unavailable. Please try again in a moment.
          </p>
        )}
        <button className="button primary auth-submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'} <span aria-hidden="true">→</span>
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to={`/sign-in${nextQuery}`}>Sign in</Link>
      </p>
    </AuthFrame>
  )
}

export function AccountSettings() {
  const { user, signOut, status, refresh } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (status === 'loading')
    return <AuthFrame eyebrow="Account" title="One moment." intro="Checking your session…" />
  if (status === 'unavailable')
    return (
      <AuthFrame
        eyebrow="Account"
        title="Connection unavailable."
        intro="The server could not be reached."
      >
        <button className="button primary" onClick={() => void refresh()}>
          Try again
        </button>
      </AuthFrame>
    )
  if (!user && busy)
    return <AuthFrame eyebrow="Account" title="Signing out." intro="Closing your session…" />
  if (!user) return <Navigate to="/sign-in?next=%2Faccount" replace />
  return (
    <AuthFrame
      eyebrow="Your account"
      title="Account settings."
      intro="The person behind this workspace."
    >
      <dl className="account-details">
        <div>
          <dt>Display name</dt>
          <dd>{user.displayName}</dd>
        </div>
        <div>
          <dt>Email address</dt>
          <dd>{user.email}</dd>
        </div>
      </dl>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="account-actions">
        <Link className="button" to="/">
          Back to workspace
        </Link>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setError('')
            setBusy(true)
            try {
              await signOut()
              navigate('/sign-in', { replace: true })
            } catch (issue) {
              setError(
                issue instanceof Error ? issue.message : 'Unable to sign out. Please try again.',
              )
              setBusy(false)
            }
          }}
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </AuthFrame>
  )
}
