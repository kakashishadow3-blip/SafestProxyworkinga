import { Outlet, Link } from 'react-router-dom'
import { useTheme } from '@/lib/theme'

const LOGO = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

export default function AuthLayout() {
  const [theme, toggle] = useTheme()

  return (
    <div className="auth-shell">
      <div className="auth-topline" />

      <header className="auth-header">
        <Link to="/login" className="auth-brand">
          <img src={LOGO} alt="SafestProxy" />
          <span>SafestProxy</span>
        </Link>
        <div className="auth-header-right">
          <button
            className="auth-moon"
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggle}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
          <a className="auth-back-link" href="https://safestproxy.com" target="_blank" rel="noopener">
            Back to safestproxy.com
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 17L17 7M9 7h8v8" /></svg>
          </a>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-hero">
          <div className="auth-eyebrow"><i />Residential Proxy Network</div>
          <h1 className="auth-h1">
            One Login.<br />
            <em>Limitless</em><br />
            <em>Access.</em>
          </h1>
          <p className="auth-sub">
            Generate country-targeted proxies, track bandwidth usage, manage billing and API access — all from one focused workspace.
          </p>
          <ul className="auth-points">
            <li><i />Country-targeted proxy access</li>
            <li><i />Usage and balance visibility</li>
            <li><i />Simple pay-as-you-go billing</li>
          </ul>
        </div>

        <div className="auth-card-wrap">
          <Outlet />
        </div>
      </main>

      <footer className="auth-footer-bar">
        <span>© 2026 SafestProxy Inc.</span>
        <div className="links">
          <a href="https://safestproxy.com/privacy-policy/" target="_blank" rel="noopener">Privacy</a>
          <a href="https://safestproxy.com/term-of-service/" target="_blank" rel="noopener">Terms</a>
          <a href="mailto:support@safestproxy.com">Contact</a>
        </div>
      </footer>
    </div>
  )
}
