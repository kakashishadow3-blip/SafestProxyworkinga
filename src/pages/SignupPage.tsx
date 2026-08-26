import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import Turnstile, { type TurnstileHandle } from '@/components/ui/Turnstile'

const GOOGLE_ICON = (
  <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
)
const GITHUB_ICON = (
  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1C5.92 1 1 5.92 1 12c0 4.87 3.15 8.99 7.52 10.44.55.1.75-.24.75-.53v-1.87c-3.06.67-3.7-1.48-3.7-1.48-.5-1.27-1.22-1.61-1.22-1.61-.99-.68.08-.66.08-.66 1.1.08 1.68 1.13 1.68 1.13.97 1.67 2.55 1.19 3.17.91.1-.71.38-1.19.69-1.46-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.19 1.13-2.96-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.76 1.13 2.96 0 4.23-2.57 5.16-5.01 5.44.39.34.74.99.74 2v2.96c0 .29.2.64.75.53C19.85 20.99 23 16.87 23 12c0-6.08-4.92-11-11-11z" /></svg>
)

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const { signUp, signInWithGoogle, signInWithGithub } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (username.trim().length < 3) { setError('Username must be at least 3 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!captchaToken) { setError('Please complete the CAPTCHA verification below.'); return }
    setLoading(true)
    const { data, error } = await signUp(email.trim(), password, username.trim(), captchaToken)
    if (error) {
      setError(error.message)
      setCaptchaToken(null)
      turnstileRef.current?.reset()
      setLoading(false)
      return
    }
    // If email confirmation is disabled, the user is signed in immediately.
    if (data.session) {
      try {
        await supabase.from('profiles').update({ username: username.trim() }).eq('id', data.user!.id)
      } catch { /* profile trigger already ran */ }
      navigate('/')
      return
    }
    setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div className="auth-card">
        <h1>Check your email.</h1>
        <p className="sub">We sent a confirmation link to <strong>{email}</strong>. Confirm your account, then sign in.</p>
        <div className="auth-success">Account created successfully. Your plan will be <strong>Non-Active</strong> until you choose a plan from the dashboard.</div>
        <div className="auth-switch">
          <Link to="/login">Back to Login
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <h1>Create your account.</h1>
      <p className="sub">Signup for SafestProxy and choose how you want to use the network.</p>

      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. kakashi230" required autoComplete="username" />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
        </div>
        <Turnstile ref={turnstileRef} onVerify={setCaptchaToken} />
        <button type="submit" className="auth-submit" disabled={loading || !captchaToken}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="auth-divider"><span>or continue with</span></div>

      <button className="btn-social" type="button" onClick={() => signInWithGoogle()}>
        {GOOGLE_ICON}
        Continue with Google
      </button>
      <button className="btn-social" type="button" onClick={() => signInWithGithub()}>
        {GITHUB_ICON}
        Continue with GitHub
      </button>

      <div className="auth-switch">
        <span>Already have an account?</span>
        <Link to="/login">Login
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  )
}
