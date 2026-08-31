import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import { cn, fmtDate } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { tierLong } from '@/lib/plans'
import PlanManager from '@/pages/admin/PlanManager'
import type { ApiRequest, CardPaymentAttempt, ContactRequest, KycVerification, Order, Profile } from '@/types'

type Tab = 'topups' | 'api' | 'contact' | 'users' | 'plans' | 'cards' | 'kyc'

type KycFilter = 'all' | 'under_review' | 'approved' | 'rejected'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

export default function AdminPanel() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('topups')

  const [orders, setOrders] = useState<Order[]>([])
  const [apiReqs, setApiReqs] = useState<ApiRequest[]>([])
  const [contacts, setContacts] = useState<ContactRequest[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [cardAttempts, setCardAttempts] = useState<CardPaymentAttempt[]>([])
  const [kycList, setKycList] = useState<KycVerification[]>([])
  const [kycFilter, setKycFilter] = useState<KycFilter>('all')
  const [kycSearch, setKycSearch] = useState('')
  const [reviewKyc, setReviewKyc] = useState<KycVerification | null>(null)
  const [docUrls, setDocUrls] = useState<{ front: string | null; back: string | null }>({ front: null, back: null })
  const [kycBusy, setKycBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: o }, { data: a }, { data: c }, { data: u }, { data: ca }, { data: k }] = await Promise.all([
      supabase.from('orders').select('*, plans(*), profiles(email, username)').order('created_at', { ascending: false }),
      supabase.from('api_requests').select('*, profiles(email)').order('created_at', { ascending: false }),
      supabase.from('contact_requests').select('*, profiles(email)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('card_payment_attempts').select('*, profiles(email)').order('created_at', { ascending: false }).limit(300),
      // kyc_verifications.user_id references auth.users (no FK to profiles) — a profiles()
      // embed errors out and returns null, so fetch plain rows and merge profiles client-side
      supabase.from('kyc_verifications').select('*').order('submitted_at', { ascending: false }),
    ])
    setOrders((o as Order[] | null) ?? [])
    setApiReqs((a as ApiRequest[] | null) ?? [])
    setContacts((c as ContactRequest[] | null) ?? [])
    const profs = (u as Profile[] | null) ?? []
    setUsers(profs)
    setCardAttempts((ca as CardPaymentAttempt[] | null) ?? [])
    const profById = new Map(profs.map(p => [p.id, p]))
    setKycList(((k as KycVerification[] | null) ?? []).map(row => {
      const p = profById.get(row.user_id)
      return { ...row, profiles: p ? { email: p.email, username: p.username, created_at: p.created_at } : null }
    }))
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

  /* ── KYC review actions ─────────────────────────────────────── */
  const openKycReview = async (k: KycVerification) => {
    setReviewKyc(k)
    setDocUrls({ front: null, back: null })
    const [f, b] = await Promise.all([
      k.front_document_path ? supabase.storage.from('kyc-documents').createSignedUrl(k.front_document_path, 300) : Promise.resolve(null),
      k.back_document_path ? supabase.storage.from('kyc-documents').createSignedUrl(k.back_document_path, 300) : Promise.resolve(null),
    ])
    setDocUrls({ front: f?.data?.signedUrl ?? null, back: b?.data?.signedUrl ?? null })
  }

  const kycEmail = async (event: 'approved' | 'rejected', userId: string, reason?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch('/api/kyc-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ event, user_id: userId, reason }),
      })
    } catch { /* email is best-effort */ }
  }

  const approveKyc = async () => {
    const k = reviewKyc
    if (!k || !user || kycBusy || k.status !== 'under_review') return
    setKycBusy(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase.from('kyc_verifications').update({
        status: 'approved', reviewed_at: now, reviewed_by: user.id, rejection_reason: null, updated_at: now,
      }).eq('id', k.id).eq('status', 'under_review')
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: k.user_id, type: 'kyc_approved', title: 'KYC Verification Approved',
        message: 'Your identity verification has been successfully approved. Your account is now verified.',
        action_url: '/profile', metadata: { event: `kyc_approved:${k.id}` },
      })
      kycEmail('approved', k.user_id)
      await logAudit(user.id, k.user_id, 'kyc_approve', 'kyc_verification', k.id, 'under_review', 'approved')
      showToast('ok', 'KYC approved', 'The user has been notified.')
      setReviewKyc(null)
      await load()
    } catch (e) {
      showToast('err', 'Could not approve', e instanceof Error ? e.message : undefined)
    }
    setKycBusy(false)
  }

  const confirmRejectKyc = async () => {
    const k = reviewKyc
    const reason = rejectReason.trim()
    if (!k || !user || kycBusy || k.status !== 'under_review') return
    if (!reason) {
      showToast('err', 'Rejection reason is required')
      return
    }
    setKycBusy(true)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase.from('kyc_verifications').update({
        status: 'rejected', reviewed_at: now, reviewed_by: user.id, rejection_reason: reason, updated_at: now,
      }).eq('id', k.id).eq('status', 'under_review')
      if (error) throw error
      await supabase.from('notifications').insert({
        user_id: k.user_id, type: 'kyc_rejected', title: 'KYC Verification Rejected',
        message: 'Your identity verification could not be approved. Please review the provided information and resubmit your documents.',
        action_url: '/profile', metadata: { event: `kyc_rejected:${k.id}:${now}` },
      })
      kycEmail('rejected', k.user_id, reason)
      await logAudit(user.id, k.user_id, 'kyc_reject', 'kyc_verification', k.id, 'under_review', 'rejected', reason)
      showToast('ok', 'KYC rejected', 'The user has been notified with the reason.')
      setRejectOpen(false)
      setRejectReason('')
      setReviewKyc(null)
      await load()
    } catch (e) {
      showToast('err', 'Could not reject', e instanceof Error ? e.message : undefined)
    }
    setKycBusy(false)
  }

  const pendingOrders = orders.filter(o => o.status === 'awaiting_topup' || o.status === 'pending')
  const pendingApi = apiReqs.filter(r => r.status === 'pending')
  const openContacts = contacts.filter(c => c.status === 'open')
  const pendingKyc = kycList.filter(k => k.status === 'under_review')
  const filteredKyc = kycList.filter(k => {
    if (kycFilter !== 'all' && k.status !== kycFilter) return false
    const q = kycSearch.trim().toLowerCase()
    if (!q) return true
    return (k.profiles?.email ?? '').toLowerCase().includes(q)
      || (k.profiles?.username ?? '').toLowerCase().includes(q)
      || k.user_id.toLowerCase().includes(q)
  })
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
          <button className={cn(tab === 'cards' && 'active')} onClick={() => setTab('cards')}>Card Attempts ({cardAttempts.length})</button>
          <button className={cn(tab === 'kyc' && 'active')} onClick={() => setTab('kyc')}>KYC Verifications ({pendingKyc.length})</button>
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

        {tab === 'cards' && (
          <div className="admin-section">
            <h2>Card Payment Attempts</h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '-4px 0 14px' }}>
              Users who tried to pay by card (declined — card payments are not live yet). No card details are ever collected or stored; only the attempt is logged.
            </p>
            {cardAttempts.length === 0 ? <div className="empty">No card payment attempts yet.</div> : (
              <table className="admin-table">
                <thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Currency</th><th>Country</th><th>City</th><th>Postal</th><th>Date</th></tr></thead>
                <tbody>
                  {cardAttempts.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{a.profiles?.email ?? a.user_id}</td>
                      <td>{a.plan_name}</td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>${Number(a.amount_usd).toFixed(2)}</td>
                      <td><span className="tag neutral">{a.currency}</span></td>
                      <td>{a.country ?? '—'}</td>
                      <td>{a.city ?? '—'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{a.postal_code ?? '—'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDate(new Date(a.created_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'kyc' && (
          <div className="admin-section">
            <h2>KYC Verifications</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div className="plan-tabs" style={{ marginBottom: 0 }}>
                {(['all', 'under_review', 'approved', 'rejected'] as KycFilter[]).map(f => (
                  <button key={f} type="button" className={cn('plan-tab', kycFilter === f && 'active')} onClick={() => setKycFilter(f)}>
                    {f === 'all' ? 'All' : f === 'under_review' ? `Under Review (${pendingKyc.length})` : f === 'approved' ? 'Approved' : 'Rejected'}
                  </button>
                ))}
              </div>
              <div className="form-row" style={{ marginBottom: 0, flex: 1, minWidth: 220, maxWidth: 340 }}>
                <input type="text" placeholder="Search by name, email or user ID…" value={kycSearch} onChange={e => setKycSearch(e.target.value)} />
              </div>
            </div>
            {filteredKyc.length === 0 ? <div className="empty">No KYC submissions found.</div> : (
              <table className="admin-table">
                <thead><tr><th>User</th><th>User ID</th><th>Country</th><th>Submitted</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                <tbody>
                  {filteredKyc.map(k => (
                    <tr key={k.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{k.profiles?.email ?? k.user_id}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{k.user_id.slice(0, 8)}…</td>
                      <td>{k.country ?? '—'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {k.submitted_at ? new Date(k.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + new Date(k.submitted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <span className={cn('tag dot', k.status === 'approved' ? 'ok' : k.status === 'under_review' ? 'warn' : 'bad')} style={{ textTransform: 'uppercase' }}>
                          {k.status === 'under_review' ? 'Under Review' : k.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-primary btn-sm" type="button" onClick={() => openKycReview(k)}>View</button>
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
      {/* ── KYC review modal ── */}
      {reviewKyc && (
        <div className="modal-backdrop show" onClick={kycBusy ? undefined : () => { setReviewKyc(null); setRejectOpen(false); setRejectReason('') }}>
          <div className="modal-card kyc-review-card" role="dialog" aria-modal="true" aria-label="KYC review" onClick={e => e.stopPropagation()}>
            <h3>KYC Verification Review</h3>

            <div className="inv-sec-lbl" style={{ marginBottom: 8 }}>User information</div>
            <div className="cur-plan-meta" style={{ marginBottom: 18 }}>
              <div className="m"><div className="l">Name</div><div className="v">{reviewKyc.profiles?.username ?? '—'}</div></div>
              <div className="m"><div className="l">Email</div><div className="v" style={{ wordBreak: 'break-all' }}>{reviewKyc.profiles?.email ?? '—'}</div></div>
              <div className="m"><div className="l">User ID</div><div className="v mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{reviewKyc.user_id}</div></div>
              <div className="m"><div className="l">Account created</div><div className="v">{reviewKyc.profiles?.created_at ? fmtDate(new Date(reviewKyc.profiles.created_at)) : '—'}</div></div>
              <div className="m"><div className="l">Country</div><div className="v">{reviewKyc.country ?? '—'}</div></div>
              <div className="m"><div className="l">Submitted</div><div className="v">{reviewKyc.submitted_at ? fmtDate(new Date(reviewKyc.submitted_at)) + ' · ' + new Date(reviewKyc.submitted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
            </div>

            <div className="inv-sec-lbl" style={{ marginBottom: 8 }}>Identity documents</div>
            <div className="kyc-docs">
              {(['front', 'back'] as const).map(side => {
                const url = side === 'front' ? docUrls.front : docUrls.back
                const path = side === 'front' ? reviewKyc.front_document_path : reviewKyc.back_document_path
                return (
                  <div className="kyc-doc" key={side}>
                    <div className="kyc-doc-l">{side === 'front' ? 'Front of Document' : 'Back of Document'}</div>
                    {!path && <div className="kyc-doc-empty">Not uploaded</div>}
                    {path && !url && <div className="kyc-doc-empty">Loading preview…</div>}
                    {path && url && (
                      path.toLowerCase().endsWith('.pdf') ? (
                        <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer">Open PDF document</a>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`${side} of identity document`} className="kyc-doc-img" />
                        </a>
                      )
                    )}
                  </div>
                )
              })}
            </div>

            {reviewKyc.status === 'under_review' ? (
              <div className="modal-actions" style={{ marginTop: 20 }}>
                <button className="btn btn-ghost" type="button" disabled={kycBusy} onClick={() => { setRejectOpen(true); setRejectReason('') }}>Reject KYC</button>
                <button className={cn('btn btn-primary', kycBusy && 'loading')} type="button" disabled={kycBusy} onClick={approveKyc}>
                  <span className="gen-spinner" />
                  <span>{kycBusy ? 'Working…' : 'Approve KYC'}</span>
                </button>
              </div>
            ) : (
              <div className="modal-actions" style={{ marginTop: 20 }}>
                <span className={cn('tag dot', reviewKyc.status === 'approved' ? 'ok' : 'bad')}>
                  {reviewKyc.status === 'approved' ? 'Approved' : 'Rejected'}
                  {reviewKyc.reviewed_at ? ` · ${fmtDate(new Date(reviewKyc.reviewed_at))}` : ''}
                </span>
                <button className="btn btn-ghost" type="button" onClick={() => setReviewKyc(null)}>Close</button>
              </div>
            )}
            {reviewKyc.status === 'rejected' && reviewKyc.rejection_reason && (
              <div className="kyc-reason" style={{ marginTop: 12 }}>
                <span className="kyc-reason-l">Rejection reason</span>
                {reviewKyc.rejection_reason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KYC reject reason modal ── */}
      {rejectOpen && reviewKyc && (
        <div className="modal-backdrop show" style={{ zIndex: 120 }} onClick={kycBusy ? undefined : () => setRejectOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Reject KYC" onClick={e => e.stopPropagation()}>
            <h3>Reject KYC Verification</h3>
            <p className="modal-sub">
              The user will see this reason and will be able to resubmit their documents.
            </p>
            <div className="form-row">
              <label>Reason for rejection</label>
              <textarea
                rows={4}
                placeholder="e.g. Document is unclear, expired, information does not match, or front/back side is missing…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" type="button" disabled={kycBusy} onClick={() => setRejectOpen(false)}>Cancel</button>
              <button className={cn('btn btn-primary', kycBusy && 'loading')} type="button" disabled={kycBusy || !rejectReason.trim()} onClick={confirmRejectKyc}>
                <span className="gen-spinner" />
                <span>{kycBusy ? 'Working…' : 'Confirm Rejection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
