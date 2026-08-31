import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/lib/toast'
import { cn, fmtDate } from '@/lib/utils'
import { subIsActive } from '@/lib/subscription'
import { INV_STATUS, invoicesFromOrders, generateInvoicePdf } from '@/lib/invoice'
import type { Order, Profile, Subscription } from '@/types'

type PTab = 'account' | 'payments' | 'plans'

interface Props {
  userId?: string // admin viewing another user's profile — read-only
}

export default function ProfileSection({ userId }: Props) {
  const { user, profile: ownProfile, updatePassword, refreshProfile } = useAuth()
  const uid = userId ?? user?.id
  const readOnly = !!userId

  const [tab, setTab] = useState<PTab>('account')

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [pdfId, setPdfId] = useState<string | null>(null)

  useEffect(() => {
    if (readOnly && userId) {
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
        .then(({ data }) => {
          const p = data as Profile | null
          setProfile(p)
          setEmail(p?.email ?? '')
          setUsername(p?.username ?? '')
        })
    } else {
      setProfile(ownProfile)
      setEmail(user?.email ?? '')
      setUsername(ownProfile?.username ?? '')
    }
  }, [readOnly, userId, user, ownProfile])

  /* Orders + subscriptions load lazily the first time a data tab opens */
  useEffect(() => {
    if (tab === 'account' || !uid || orders.length > 0 || subs.length > 0 || dataLoading) return
    setDataLoading(true)
    Promise.all([
      supabase.from('orders').select('*, plans(*)').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('*, plans(*)').eq('user_id', uid).order('created_at', { ascending: false }),
    ]).then(([{ data: o }, { data: s }]) => {
      setOrders((o as Order[] | null) ?? [])
      setSubs((s as Subscription[] | null) ?? [])
      setDataLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, uid])

  const invoices = useMemo(() => invoicesFromOrders(orders), [orders])
  const activeSubs = useMemo(() => subs.filter(s => subIsActive(s)), [subs])
  const expiredSubs = useMemo(() => subs.filter(s => !subIsActive(s)), [subs])

  const handleUpdate = async () => {
    if (readOnly) return
    setSaving(true)
    try {
      // username → profiles table
      const newUsername = username.trim()
      if (newUsername !== (ownProfile?.username ?? '')) {
        const { error } = await supabase.from('profiles').update({ username: newUsername || null }).eq('id', user!.id)
        if (error) throw error
        await refreshProfile()
      }
      // email → auth (sends a confirmation link)
      const newEmail = email.trim()
      if (newEmail && newEmail !== user?.email) {
        const { error } = await supabase.auth.updateUser({ email: newEmail })
        if (error) throw error
        showToast('ok', 'Email confirmation sent', 'Check your new inbox to confirm the change.')
      }
      // password — synced straight into Supabase Auth
      if (pass1 || pass2) {
        if (pass1 !== pass2) {
          showToast('err', 'Passwords do not match')
          setSaving(false)
          return
        }
        if (pass1.length < 6) {
          showToast('err', 'Password must be at least 6 characters')
          setSaving(false)
          return
        }
        const { error } = await updatePassword(pass1)
        if (error) throw error
        setPass1('')
        setPass2('')
        showToast('ok', 'Password updated', 'Your new password is active immediately.')
      }
      showToast('ok', 'Profile updated', 'Your account details have been saved.')
    } catch (e) {
      showToast('err', 'Could not update profile', e instanceof Error ? e.message : undefined)
    }
    setSaving(false)
  }

  /* Direct PDF download from the payment-history row */
  const downloadInvoice = (num: string) => {
    if (pdfId) return
    const inv = invoices.find(i => i.num === num)
    if (!inv) return
    setPdfId(num)
    const customer = {
      name: profile?.username || profile?.email?.split('@')[0] || 'Customer',
      email: profile?.email ?? '',
      username: profile?.username ?? profile?.email?.split('@')[0] ?? '',
    }
    setTimeout(() => {
      try {
        generateInvoicePdf(inv, customer)
        showToast('ok', 'PDF downloaded successfully.', 'SafestProxy-Invoice-' + inv.num + '.pdf')
      } catch {
        showToast('err', 'Unable to complete this action. Please try again.')
      }
      setPdfId(null)
    }, 60)
  }

  const planRow = (s: Subscription, active: boolean) => (
    <div className="myplan-row" key={s.id}>
      <div style={{ flex: 1.4, minWidth: 160 }}>
        <div className="myplan-name">{s.plans?.name ?? 'Plan'}</div>
        <div className="myplan-meta">
          Purchased {s.start_date ? fmtDate(new Date(s.start_date)) : fmtDate(new Date(s.created_at))}
          {' · '}{active ? 'Expires' : 'Expired'} {s.expiry_date ? fmtDate(new Date(s.expiry_date)) : '—'}
        </div>
      </div>
      <span className={cn('tag dot', active ? 'ok' : 'bad')} style={{ flex: 'none' }}>
        {active ? 'Active' : 'Expired'}
      </span>
    </div>
  )

  return (
    <section className="section active">
      <div className="plan-tabs" style={{ marginBottom: 20 }}>
        <button type="button" className={cn('plan-tab', tab === 'account' && 'active')} onClick={() => setTab('account')}>Account</button>
        <button type="button" className={cn('plan-tab', tab === 'payments' && 'active')} onClick={() => setTab('payments')}>Payment History</button>
        <button type="button" className={cn('plan-tab', tab === 'plans' && 'active')} onClick={() => setTab('plans')}>Plan Details</button>
      </div>

      {/* ================= Account ================= */}
      {tab === 'account' && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Profile</h3>
              <div className="inner-eyebrow" style={{ margin: '8px 0 0' }}>Update Profile</div>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.7, marginBottom: 24 }}>
            Keep your contact details current and protect your account with a strong password.
          </p>

          <div className="form-row">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" disabled={readOnly} />
          </div>
          <div className="form-row">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your display name" autoComplete="off" disabled={readOnly} />
          </div>
          {!readOnly && (
            <div className="field-grid">
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Update Password</label>
                <input type="password" value={pass1} onChange={e => setPass1(e.target.value)} placeholder="Enter a new password" autoComplete="new-password" />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Confirm password</label>
                <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="Repeat the new password" autoComplete="new-password" />
              </div>
            </div>
          )}
          {!readOnly && (
            <div style={{ marginTop: 24 }}>
              <button className="btn btn-primary" type="button" disabled={saving} onClick={handleUpdate}>
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= Payment History ================= */}
      {tab === 'payments' && (
        <div className="panel">
          <div className="panel-head">
            <div><h3>Payment History</h3><p>Every plan you have purchased, with its invoice — download any of them as PDF.</p></div>
          </div>
          {dataLoading && <div className="empty">Loading payments…</div>}
          {!dataLoading && invoices.length > 0 && (
            <div className="inv-table-wrap">
              <table>
                <thead><tr><th>Invoice</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                <tbody>
                  {invoices.map(inv => {
                    const [lbl, cls] = INV_STATUS[inv.status] ?? ['PENDING', 'warn']
                    return (
                      <tr key={inv.num}>
                        <td><span className="inv-num">#{inv.num}</span></td>
                        <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{inv.plan}</td>
                        <td className="mono" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>${inv.amount.toFixed(2)}</td>
                        <td><span className={cn('tag dot', cls)}>{lbl}</span></td>
                        <td className="mono" style={{ fontSize: 12 }}>{inv.date}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className={cn('btn btn-primary btn-sm', pdfId === inv.num && 'loading')}
                            type="button"
                            disabled={!!pdfId}
                            onClick={() => downloadInvoice(inv.num)}
                          >
                            <span className="gen-spinner" />
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={pdfId === inv.num ? { display: 'none' } : undefined}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
                            <span>{pdfId === inv.num ? 'Generating…' : 'Download'}</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!dataLoading && invoices.length === 0 && (
            <div className="inv-empty show">
              <div className="ae-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6" /></svg></div>
              <h4>No payments yet</h4>
              <p>Your invoices will appear here after your first successful payment.</p>
            </div>
          )}
        </div>
      )}

      {/* ================= Plan Details ================= */}
      {tab === 'plans' && (
        <>
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <div>
                <h3>Active Plans ({activeSubs.length})</h3>
                <p>Plans that are live on your account right now.</p>
              </div>
            </div>
            {dataLoading && <div className="empty">Loading plans…</div>}
            {!dataLoading && activeSubs.length === 0 && <div className="empty">No active plans.</div>}
            {!dataLoading && activeSubs.map(s => planRow(s, true))}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Expired Plans ({expiredSubs.length})</h3>
                <p>Plans that have ended — purchase again any time from Available Plans.</p>
              </div>
            </div>
            {dataLoading && <div className="empty">Loading plans…</div>}
            {!dataLoading && expiredSubs.length === 0 && <div className="empty">No expired plans.</div>}
            {!dataLoading && expiredSubs.map(s => planRow(s, false))}
          </div>
        </>
      )}
    </section>
  )
}
