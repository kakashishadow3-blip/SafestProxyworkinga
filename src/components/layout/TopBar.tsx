import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
} from '@/lib/notifications'
import type { AppNotification, Subscription } from '@/types'

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

/* small relative timestamp: "just now", "12m ago", "3h ago", "2d ago", else date */
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const NTF_ICONS: Record<string, string> = {
  plan_expired: 'M12 8v4l3 3M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  low_data: 'M12 3v3M5.6 5.6l2.2 2.2M3 12h3M12 21a9 9 0 0 0 9-9h-3a6 6 0 1 1-12 0H3a9 9 0 0 0 9 9z',
  data_exhausted: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  kyc: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4zM9 12l2 2 4-4',
}

function ntfIcon(type: string) {
  const d = NTF_ICONS[type.startsWith('kyc') ? 'kyc' : type] ?? 'M12 8v4M12 16h.01M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z'
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  )
}

export default function TopBar({ subscription }: Props) {
  const { profile, user, signOut } = useAuth()
  const [theme, toggleTheme] = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const [ntfOpen, setNtfOpen] = useState(false)
  const [ntfs, setNtfs] = useState<AppNotification[]>([])
  const [ntfLoading, setNtfLoading] = useState(false)
  const ntfRef = useRef<HTMLDivElement>(null)

  const [title, sub] = NAV_TITLES[location.pathname] ?? ['Dashboard', 'Your balance and recent activity']

  const unread = ntfs.filter(n => !n.is_read).length

  const loadNtfs = async () => {
    if (!user) return
    setNtfLoading(true)
    setNtfs(await fetchNotifications(user.id))
    setNtfLoading(false)
  }

  useEffect(() => { loadNtfs() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  useEffect(() => {
    if (!ntfOpen) return
    const onDoc = (e: MouseEvent) => {
      if (ntfRef.current && !ntfRef.current.contains(e.target as Node)) setNtfOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [ntfOpen])

  const openNtf = async (n: AppNotification) => {
    if (!n.is_read) {
      setNtfs(list => list.map(x => (x.id === n.id ? { ...x, is_read: true } : x)))
      await markNotificationRead(n.id)
    }
    if (n.action_url) {
      setNtfOpen(false)
      navigate(n.action_url)
    }
  }

  const markAll = async () => {
    if (!user || unread === 0) return
    setNtfs(list => list.map(x => ({ ...x, is_read: true })))
    await markAllNotificationsRead(user.id)
  }

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
        <button
          className="tb-icon-btn"
          type="button"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
        </button>

        <div className={cn('ntf-wrap', ntfOpen && 'open')} ref={ntfRef}>
          <button
            className="tb-icon-btn ntf-btn"
            type="button"
            aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
            aria-expanded={ntfOpen}
            title="Notifications"
            onClick={() => { setNtfOpen(o => !o); if (!ntfOpen) loadNtfs() }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {unread > 0 && <span className="ntf-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>

          <div className="ntf-dropdown">
            <div className="ntf-head">
              <span className="ntf-head-t">Notifications{unread > 0 ? ` (${unread})` : ''}</span>
              {unread > 0 && (
                <button type="button" className="ntf-mark-all" onClick={markAll}>Mark all as read</button>
              )}
            </div>
            <div className="ntf-list">
              {ntfLoading && ntfs.length === 0 && <div className="ntf-empty">Loading…</div>}
              {!ntfLoading && ntfs.length === 0 && (
                <div className="ntf-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                  <span>No notifications yet.<br />System notifications and updates will appear here.</span>
                </div>
              )}
              {ntfs.map(n => (
                <button
                  key={n.id}
                  type="button"
                  className={cn('ntf-item', !n.is_read && 'unread')}
                  onClick={() => openNtf(n)}
                >
                  <span className={cn('ntf-ic', n.type)}>{ntfIcon(n.type)}</span>
                  <span className="ntf-body">
                    <span className="ntf-t">{n.title}</span>
                    <span className="ntf-m">{n.message}</span>
                    <span className="ntf-time">{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.is_read && <span className="ntf-dot" />}
                </button>
              ))}
            </div>
          </div>
        </div>

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
