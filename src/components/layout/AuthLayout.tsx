import { Outlet, Link } from 'react-router-dom'

const LOGO = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

export default function AuthLayout() {
  return (
    <div className="auth-shell">
      <div className="auth-topline" />

      <header className="auth-header">
        <Link to="/login" className="auth-brand">
          <img src={LOGO} alt="SafestProxy" />
          <span>SafestProxy</span>
        </Link>
        <div className="auth-header-right">
          <button className="auth-moon" type="button" aria-label="Theme">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
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
            One Account.<br />
            <em>Every</em><br />
            <em>Connection.</em>
          </h1>
          <p className="auth-sub">
            Manage residential proxy access, bandwidth sharing, billing, and referrals from one focused workspace.
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
          <a href="https://safestproxy.com/privacy" target="_blank" rel="noopener">Privacy</a>
          <a href="https://safestproxy.com/terms" target="_blank" rel="noopener">Terms</a>
          <a href="mailto:support@safestproxy.com">Contact</a>
        </div>
      </footer>
    </div>
  )
}
