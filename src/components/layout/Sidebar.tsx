import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types'
import { tierLabel } from '@/lib/plans'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

const ICONS = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  proxy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  api: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
  plans: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  billing: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  admin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" /></svg>,
}

interface Props {
  open: boolean
  onClose: () => void
  subscription: Subscription | null
  isAdmin: boolean
}

export default function Sidebar({ open, onClose, subscription, isAdmin }: Props) {
  const navigate = useNavigate()
  const active = subscription && subscription.status === 'active'
  const planName = subscription?.plans?.name ?? 'Non-Active'
  const used = subscription ? Math.max(0, subscription.bandwidth_limit_gb - subscription.bandwidth_used_gb) : 0
  const total = subscription?.bandwidth_limit_gb ?? 0
  const pct = active && total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0

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
      {item('/plans', 'plans', 'Available Plans')}
      {item('/billing', 'billing', 'Billing')}

      {isAdmin && (
        <>
          <div className="nav-divider" />
          <div className="nav-group-label">Admin</div>
          {item('/admin', 'admin', 'Admin Panel')}
        </>
      )}

      <div className="sb-spacer" />

      {active && total > 0 && (
        <div className="sb-plan-card" style={{ marginBottom: 14, cursor: 'pointer' }} onClick={() => { navigate('/billing'); onClose() }}>
          <div className="lbl">Current Plan</div>
          <div className="name">{planName}</div>
          <div className="sb-bar"><div className="sb-bar-fill" style={{ width: `${pct}%` }} /></div>
          <div className="sub">{tierLabel(used)} left of {tierLabel(total)}</div>
        </div>
      )}

      {item('/profile', 'profile', 'Profile')}
    </aside>
  )
}
