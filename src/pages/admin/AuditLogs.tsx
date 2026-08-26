import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn, fmtDate } from '@/lib/utils'
import type { AuditLog } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*, admin:profiles!audit_logs_admin_user_id_fkey(email), target:profiles!audit_logs_target_user_id_fkey(email)')
        .order('created_at', { ascending: false })
        .limit(200)
      setLogs((data as AuditLog[] | null) ?? [])
      setLoading(false)
    })()
  }, [])

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="topbar admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="logo-mark">
            <img src={LOGO_URL} alt="SafestProxy" />
            <div className="logo-pulse" />
          </div>
          <div>
            <div className="tb-title" style={{ fontSize: 26 }}>Audit Logs</div>
            <div className="tb-sub">Every admin action, recorded</div>
          </div>
          <span className="admin-badge">ADMIN</span>
        </div>
        <Link to="/admin" className="btn btn-secondary btn-sm">Back to Admin Panel</Link>
      </div>

      <div className="admin-panel">
        <div className="admin-section">
          {loading ? (
            <div className="empty">Loading logs…</div>
          ) : logs.length === 0 ? (
            <div className="empty">No admin actions recorded yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Admin</th><th>Target user</th><th>Action</th><th>Entity</th><th>Old → New</th><th>Reason</th><th>Date</th></tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{l.admin?.email ?? l.admin_user_id}</td>
                    <td>{l.target?.email ?? l.target_user_id}</td>
                    <td><span className={cn('tag dot', l.action.includes('reject') || l.action.includes('spam') ? 'revoked' : l.action.includes('approve') ? 'ok' : 'neutral')}>{l.action}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{l.entity_type}</td>
                    <td><div className="cell-wrap" style={{ fontSize: 12 }}>{l.old_value ?? '—'} → {l.new_value ?? '—'}</div></td>
                    <td><div className="cell-wrap" style={{ fontSize: 12 }}>{l.reason ?? '—'}</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{fmtDate(new Date(l.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
