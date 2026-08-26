import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types'

export const NAV_TITLES: Record<string, [string, string]> = {
  '/': ['Dashboard', 'Your balance and recent activity'],
  '/proxy-access': ['Network Access', 'Generate and manage proxy endpoints'],
  '/api-management': ['API Management', 'Request API access and manage keys'],
  '/plans': ['Available Plans', 'Choose the plan that fits your needs'],
  '/billing': ['Billing', 'Your plan, balance and invoices'],
  '/profile': ['Profile', 'Manage your account settings'],
}

interface Props {
  subscription: Subscription | null
}

export default function TopBar({ subscription }: Props) {
  const { profile, user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const [title, sub] = NAV_TITLES[location.pathname] ?? ['Dashboard', 'Your balance and recent activity']

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const name = profile?.username || user?.email?.split('@')[0] || 'User'
  const email = user?.email ?? ''
  const active = !!subscription && subscription.status === 'active'
  const badgeText = active ? (subscription?.plans?.name ?? 'Active') : 'Non-Active'

  const avatarIcon = (size = 18) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )

  return (
    <div className="topbar">
      <div>
        <div className="tb-title">{title}</div>
        <div className="tb-sub">{sub}</div>
      </div>
      <div className="tb-right">
        <span className={cn('badge-plan', !active && 'warn')} style={{ textTransform: 'uppercase' }}>{badgeText}</span>

        <div className={cn('user-menu-wrap', menuOpen && 'open')} ref={menuRef}>
          <button className="user-menu-btn" type="button" aria-expanded={menuOpen} aria-haspopup="true" onClick={() => setMenuOpen(o => !o)}>
            <div className="user-menu-avatar">{avatarIcon()}</div>
            <span className="user-menu-name">{name}</span>
            <svg className="user-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          <div className="user-dropdown">
            <div className="user-dropdown-head">
              <div className="user-menu-avatar lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{avatarIcon()}</div>
              <div>
                <div className="ud-name">{name}</div>
                <div className="ud-mail">{email}</div>
              </div>
            </div>
            <div className="ud-items">
              <button type="button" className="ud-item" onClick={() => { setMenuOpen(false); navigate('/profile') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                Profile
              </button>
              <button type="button" className="ud-item" onClick={() => { setMenuOpen(false); navigate('/billing') }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
                Billing
              </button>
              {profile?.is_admin && (
                <button type="button" className="ud-item" onClick={() => { setMenuOpen(false); navigate('/admin') }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" /></svg>
                  Admin Panel
                </button>
              )}
              <button type="button" className="ud-item" onClick={async () => { setMenuOpen(false); await signOut() }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
