import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types'
import { tierLabel, PRODUCT_META, PRODUCT_ORDER, productOf } from '@/lib/plans'
import { subIsActive } from '@/lib/subscription'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

const ICONS = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  proxy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  api: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  plans: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  billing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  admin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" /></svg>,
  help: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>,
  chevron: <svg className="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>,
  extlink: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
}

const HELP_LINKS = [
  { label: 'Blog', url: 'https://safestproxy.com/blog/' },
  { label: 'FAQ', url: 'https://safestproxy.com/faq/' },
  { label: 'Terms of Service', url: 'https://safestproxy.com/term-of-service/' },
]

interface Props {
  open: boolean
  onClose: () => void
  subscription: Subscription | null
  subscriptions?: Subscription[]
  isAdmin: boolean
}

export default function Sidebar({ open, onClose, subscription, subscriptions, isAdmin }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [plansOpen, setPlansOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  /* NavLink ignores ?query when matching — detect the active product manually
     so ONLY the pressed item highlights */
  const onPlansPage = location.pathname === '/plans'
  const activeProduct = onPlansPage ? (new URLSearchParams(location.search).get('product') ?? '') : null

  /* Multi-plan: every effectively-active subscription gets its own mini card */
  const activeSubs = (subscriptions && subscriptions.length ? subscriptions : subscription ? [subscription] : [])
    .filter(s => subIsActive(s))

  const item = (to: string, icon: keyof typeof ICONS, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn('nav-item', isActive && 'active')}
      onClick={onClose}
    >
      {ICONS[icon]}
      {label}
    </NavLink>
  )

  return (
    <aside className={cn('sidebar', open && 'open')}>
      <div className="sb-logo">
        <div className="logo-mark">
          <img src={LOGO_URL} alt="SafestProxy" />
          <div className="logo-pulse" />
        </div>
        <div>
          <div className="sb-brand">SafestProxy</div>
          <div className="sb-tag">Dashboard</div>
        </div>
        <button type="button" className="sb-close-btn" aria-label="Close menu" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="nav-group-label">Main</div>
      {item('/', 'overview', 'Overview', true)}
      {item('/proxy-access', 'proxy', 'Proxy Access')}
      {item('/api-management', 'api', 'API Management')}

      {/* Available Plans — dropdown listing each product family */}
      <button
        type="button"
        className={cn('nav-item nav-toggle', plansOpen && 'open')}
        onClick={() => setPlansOpen(v => !v)}
      >
        {ICONS.plans}
        Available Plans
        {ICONS.chevron}
      </button>
      <div className={cn('nav-sub', plansOpen && 'show')}>
        <button
          type="button"
          className={cn('nav-sub-item', onPlansPage && activeProduct === '' && 'active')}
          onClick={() => { navigate('/plans'); onClose() }}
        >
          All Products
        </button>
        {PRODUCT_ORDER.map(key => (
          <button
            key={key}
            type="button"
            className={cn('nav-sub-item', activeProduct === key && 'active')}
            onClick={() => { navigate(`/plans?product=${key}`); onClose() }}
          >
            {PRODUCT_META[key].name}
          </button>
        ))}
      </div>

      {item('/billing', 'billing', 'Billing')}

      {/* Help Center — external resources */}
      <button
        type="button"
        className={cn('nav-item nav-toggle', helpOpen && 'open')}
        onClick={() => setHelpOpen(v => !v)}
      >
        {ICONS.help}
        Help Center
        {ICONS.chevron}
      </button>
      <div className={cn('nav-sub', helpOpen && 'show')}>
        {HELP_LINKS.map(l => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="nav-sub-item" onClick={onClose}>
            {l.label}
            <span className="nav-ext">{ICONS.extlink}</span>
          </a>
        ))}
      </div>

      {isAdmin && (
        <>
          <div className="nav-divider" />
          <div className="nav-group-label">Admin</div>
          {item('/admin', 'admin', 'Admin Panel')}
        </>
      )}

      <div className="sb-spacer" />

      {activeSubs.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {activeSubs.length > 1 && <div className="sb-plans-count">{activeSubs.length} plans active</div>}
          {activeSubs.slice(0, 3).map(s => {
            const total = s.bandwidth_limit_gb ?? 0
            const left = Math.max(0, total - s.bandwidth_used_gb)
            const pct = total > 0 ? Math.min(100, Math.max(0, (left / total) * 100)) : 100
            return (
              <div key={s.id} className="sb-plan-card" style={{ cursor: 'pointer', marginBottom: 8 }} onClick={() => { navigate('/billing'); onClose() }}>
                <div className="lbl">{PRODUCT_META[productOf(s.plans?.name ?? '')]?.name ?? 'Plan'}</div>
                <div className="name">{s.plans?.name ?? 'Active plan'}</div>
                {total > 0 && <div className="sb-bar"><div className="sb-bar-fill" style={{ width: `${pct}%` }} /></div>}
                <div className="sub">{total > 0 ? `${tierLabel(left)} left of ${tierLabel(total)}` : 'Unlimited traffic'}</div>
              </div>
            )
          })}
          {activeSubs.length > 3 && (
            <button type="button" className="sb-more-plans" onClick={() => { navigate('/billing'); onClose() }}>
              +{activeSubs.length - 3} more — view all
            </button>
          )}
        </div>
      )}

      {item('/profile', 'profile', 'Profile')}
    </aside>
  )
}
