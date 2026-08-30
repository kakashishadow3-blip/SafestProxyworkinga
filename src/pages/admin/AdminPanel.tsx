import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import { cn, fmtDate } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { tierLong } from '@/lib/plans'
import PlanManager from '@/pages/admin/PlanManager'
import type { ApiRequest, ContactRequest, Order, Profile } from '@/types'

type Tab = 'topups' | 'api' | 'contact' | 'users' | 'plans'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

export default function AdminPanel() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('topups')

  const [orders, setOrders] = useState<Order[]>([])
  const [apiReqs, setApiReqs] = useState<ApiRequest[]>([])
  const [contacts, setContacts] = useState<ContactRequest[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: o }, { data: a }, { data: c }, { data: u }] = await Promise.all([
      supabase.from('orders').select('*, plans(*), profiles(email, username)').order('created_at', { ascending: false }),
      supabase.from('api_requests').select('*, profiles(email)').order('created_at', { ascending: false }),
      supabase.from('contact_requests').select('*, profiles(email)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ])
    setOrders((o as Order[] | null) ?? [])
    setApiReqs((a as ApiRequest[] | null) ?? [])
    setContacts((c as ContactRequest[] | null) ?? [])
    setUsers((u as Profile[] | null) ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  /* Approve a top-up: order → active, subscription upsert, proxy credentials ensured */
  const approveOrder = async (order: Order) => {
    if (!user) return
    setBusyId(order.id)
    try {
      const { error: oErr } = await supabase.from('orders').update({ status: 'active' }).eq('id', order.id)
      if (oErr) throw oErr

      const plan = order.plans
      const start = new Date()
      const expiry = new Date(start.getTime() + (plan?.duration_days ?? 30) * 86400000)

      // multi-plan model: the new plan activates alongside any existing active plans

      const { data: sub, error: sErr } = await supabase.from('subscriptions').insert({
        user_id: order.user_id,
        plan_id: order.plan_id,
        status: 'active',
        bandwidth_used_gb: 0,
        bandwidth_limit_gb: plan?.bandwidth_gb ?? 0,
        start_date: start.toISOString(),
        expiry_date: expiry.toISOString(),
      }).select().single()
      if (sErr) throw sErr

      // ensure proxy credentials exist
      const { data: cred } = await supabase.from('proxy_credentials').select('id').eq('user_id', order.user_id).limit(1)
      if (!cred || cred.length === 0) {
        const un = 'u' + Math.random().toString(36).slice(2, 12)
        const pw = Math.random().toString(36).slice(2, 14)
        await supabase.from('proxy_credentials').insert({
          user_id: order.user_id,
          dataimpulse_username: un,
          dataimpulse_password: pw,
          host: 'gate.safestproxy.com',
          port: 7777,
          status: 'active',
        })
      }

      await logAudit(user.id, order.user_id, 'approve_topup', 'order', order.id,
        `status: ${order.status}`, `status: active · subscription ${sub?.id ?? ''} activated`,
        `Plan: ${plan?.name ?? '—'} ($${Number(order.amount).toFixed(2)})`)

      showToast('ok', 'Top-up approved', `${order.profiles?.email ?? 'User'} · ${plan?.name ?? ''} is now active.`)
      await load()
    } catch (e) {
      showToast('err', 'Approval failed', e instanceof Error ? e.message : undefined)
    }
    setBusyId(null)
  }

  const rejectOrder = async (order: Order) => {
    if (!user) return
    setBusyId(order.id)
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (error) showToast('err', 'Could not reject order', error.message)
    else {
      await logAudit(user.id, order.user_id, 'reject_topup', 'order', order.id, `status: ${order.status}`, 'status: cancelled')
      showToast('ok', 'Order rejected')
      await load()
    }
    setBusyId(null)
  }

  const setApiStatus = async (req: ApiRequest, status: 'approved' | 'rejected') => {
    if (!user) return
    setBusyId(req.id)
    const { error } = await supabase.from('api_requests').update({ status }).eq('id', req.id)
    if (error) showToast('err', 'Could not update request', error.message)
    else {
      await logAudit(user.id, req.user_id, `api_${status}`, 'api_request', req.id, `status: ${req.status}`, `status: ${status}`)
      showToast('ok', status === 'approved' ? 'API access approved' : 'API access rejected', req.profiles?.email ?? undefined)
      await load()
    }
    setBusyId(null)
  }

  const setContactStatus = async (c: ContactRequest, status: 'resolved' | 'spam') => {
    if (!user) return
    setBusyId(c.id)
    const { error } = await supabase.from('contact_requests').update({ status }).eq('id', c.id)
    if (error) showToast('err', 'Could not update request', error.message)
    else {
      if (c.user_id) await logAudit(user.id, c.user_id, `contact_${status}`, 'contact_request', c.id, `status: ${c.status}`, `status: ${status}`)
      showToast('ok', `Marked as ${status}`)
      await load()
    }
    setBusyId(null)
  }

  const pendingOrders = orders.filter(o => o.status === 'awaiting_topup' || o.status === 'pending')
  const pendingApi = apiReqs.filter(r => r.status === 'pending')
  const openContacts = contacts.filter(c => c.status === 'open')
  const filteredUsers = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.username ?? '').toLowerCase().includes(search.toLowerCase()))

  const statusTag = (s: string) =>
    s === 'active' || s === 'paid' || s === 'approved' || s === 'resolved' ? 'ok'
      : s === 'cancelled' || s === 'rejected' || s === 'spam' ? 'revoked'
        : 'warn'

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="topbar admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="logo-mark">
            <img src={LOGO_URL} alt="SafestProxy" />
            <div className="logo-pulse" />
          </div>
          <div>
            <div className="tb-title" style={{ fontSize: 26 }}>Admin Panel</div>
            <div className="tb-sub">Signed in as {profile?.email}</div>
          </div>
          <span className="admin-badge">ADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/admin/audit-logs" className="btn btn-secondary btn-sm">Audit Logs</Link>
          <Link to="/" className="btn btn-secondary btn-sm">Back to Dashboard</Link>
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-tabs">
          <button className={cn(tab === 'topups' && 'active')} onClick={() => setTab('topups')}>Pending Top-ups ({pendingOrders.length})</button>
          <button className={cn(tab === 'api' && 'active')} onClick={() => setTab('api')}>API Requests ({pendingApi.length})</button>
          <button className={cn(tab === 'contact' && 'active')} onClick={() => setTab('contact')}>Contact Requests ({openContacts.length})</button>
          <button className={cn(tab === 'users' && 'active')} onClick={() => setTab('users')}>Users ({users.length})</button>
          <button className={cn(tab === 'plans' && 'active')} onClick={() => setTab('plans')}>Plans & Pricing</button>
        </div>

        {tab === 'plans' && <PlanManager />}

        {tab === 'topups' && (
          <div className="admin-section">
            <h2>Pending Top-ups</h2>
            {pendingOrders.length === 0 ? <div className="empty">No pending top-ups.</div> : (
              <table className="admin-table">
                <thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {pendingOrders.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{o.profiles?.email ?? o.user_id}</td>
                      <td>{o.plans?.name ?? '—'}{o.plans ? ` · ${tierLong(o.plans.bandwidth_gb)}` : ''}</td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>${Number(o.amount).toFixed(2)}</td>
                      <td><span className={cn('tag dot', statusTag(o.status))} style={{ textTransform: 'uppercase' }}>{o.status.replace('_', ' ')}</span></td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDate(new Date(o.created_at))}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-primary btn-sm" disabled={busyId === o.id} onClick={() => approveOrder(o)}>Approve</button>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === o.id} onClick={() => rejectOrder(o)}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'api' && (
          <div className="admin-section">
            <h2>API Access Requests</h2>
            {apiReqs.length === 0 ? <div className="empty">No API requests yet.</div> : (
              <table className="admin-table">
                <thead><tr><th>User</th><th>Purpose</th><th>Integration</th><th>Volume</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {apiReqs.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{r.profiles?.email ?? r.user_id}</td>
                      <td>{r.purpose}</td>
                      <td><div className="cell-wrap" style={{ fontSize: 12 }}>{r.integration}</div></td>
                      <td>{r.expected_volume ?? '—'}</td>
                      <td><span className={cn('tag dot', statusTag(r.status))} style={{ textTransform: 'uppercase' }}>{r.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {r.status === 'pending' && (
                          <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" disabled={busyId === r.id} onClick={() => setApiStatus(r, 'approved')}>Approve</button>
                            <button className="btn btn-ghost btn-sm" disabled={busyId === r.id} onClick={() => setApiStatus(r, 'rejected')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'contact' && (
          <div className="admin-section">
            <h2>Contact Requests</h2>
            {contacts.length === 0 ? <div className="empty">No contact requests.</div> : (
              <table className="admin-table">
                <thead><tr><th>User</th><th>Message</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{c.profiles?.email ?? 'Guest'}</td>
                      <td><div className="cell-wrap" style={{ fontSize: 12 }}>{c.message}</div></td>
                      <td><span className={cn('tag dot', statusTag(c.status))} style={{ textTransform: 'uppercase' }}>{c.status}</span></td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDate(new Date(c.created_at))}</td>
                      <td style={{ textAlign: 'right' }}>
                        {c.status === 'open' && (
                          <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" disabled={busyId === c.id} onClick={() => setContactStatus(c, 'resolved')}>Resolve</button>
                            <button className="btn btn-ghost btn-sm" disabled={busyId === c.id} onClick={() => setContactStatus(c, 'spam')}>Spam</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="admin-section">
            <h2>Users</h2>
            <div className="form-row" style={{ maxWidth: 420 }}>
              <input type="text" placeholder="Search by email or username…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {filteredUsers.length === 0 ? <div className="empty">No users found.</div> : (
              <table className="admin-table">
                <thead><tr><th>Email</th><th>Username</th><th>Role</th><th>Joined</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{u.email}</td>
                      <td>{u.username ?? '—'}</td>
                      <td>{u.is_admin ? <span className="admin-badge">ADMIN</span> : <span className="tag neutral">User</span>}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDate(new Date(u.created_at))}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/admin/users/${u.id}`)}>Access Dashboard</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
