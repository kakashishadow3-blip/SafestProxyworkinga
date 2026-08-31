import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import CustomSelect from '@/components/ui/CustomSelect'
import { useAuth } from '@/hooks/useAuth'
import { cn, fmtDate } from '@/lib/utils'
import { subIsActive, subIsExpired, subIsExhausted } from '@/lib/subscription'
import { showToast } from '@/lib/toast'
import { productOf, PRODUCT_META, tierLong, periodOf } from '@/lib/plans'
import { INV_STATUS, invoicesFromOrders, generateInvoicePdf } from '@/lib/invoice'
import type { Invoice } from '@/lib/invoice'
import type { Order, Profile, Subscription } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

interface Props {
  userId?: string
}

export default function Billing({ userId }: Props) {
  const { user, profile: ownProfile } = useAuth()
  const uid = userId ?? user?.id
  const readOnly = !!userId
  const navigate = useNavigate()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [allSubs, setAllSubs] = useState<Subscription[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [viewSubId, setViewSubId] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfLbl, setPdfLbl] = useState('Download PDF')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'waiting'>('idle')
  const [searchParams, setSearchParams] = useSearchParams()

  const loadData = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    const [{ data: prof }, { data: sub }, { data: ords }] = await Promise.all([
      readOnly
        ? supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
        : Promise.resolve({ data: ownProfile }),
      supabase.from('subscriptions').select('*, plans(*)').eq('user_id', uid)
        .order('created_at', { ascending: false }),
      supabase.from('orders').select('*, plans(*)').eq('user_id', uid).order('created_at', { ascending: false }),
    ])
    const subs = (sub as Subscription[] | null) ?? []
    setProfile((prof as Profile | null) ?? null)
    setAllSubs(subs)
    /* Primary = first effectively-active plan, else the latest row */
    const primary = subs.find(s => subIsActive(s)) ?? subs[0] ?? null
    setSubscription(primary)
    /* keep the admin/user's current selection if it still exists */
    setViewSubId(prev => (prev && subs.some(s => s.id === prev) ? prev : primary?.id ?? ''))
    setOrders((ords as Order[] | null) ?? [])
    setLoading(false)
  }, [uid, readOnly, ownProfile])

  useEffect(() => { loadData() }, [loadData])

  /* Return from Cryptomus checkout → poll until the payment is confirmed, then refresh */
  useEffect(() => {
    const payment = searchParams.get('payment')
    const orderId = searchParams.get('order_id')
    if (payment !== 'success' || !orderId || !uid || readOnly) return
    let stopped = false
    let tries = 0
    setVerifyState('checking')
    const finish = (state: 'idle' | 'waiting') => {
      setVerifyState(state)
      setSearchParams({}, { replace: true })
    }
    const tick = async () => {
      if (stopped) return
      tries += 1
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/payment-status?order_id=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const json = await res.json().catch(() => null)
        if (json?.status === 'paid') {
          stopped = true
          finish('idle')
          showToast('ok', 'Payment confirmed', 'Your plan is now active — the invoice is ready below.')
          await loadData()
          return
        }
      } catch { /* keep polling */ }
      if (stopped) return
      if (tries >= 20) {
        finish('waiting')
        showToast('ok', 'Payment received', 'Confirmation is in progress — your plan will activate automatically within a few minutes.')
        return
      }
      setTimeout(tick, 3000)
    }
    tick()
    return () => { stopped = true }
  }, [searchParams, uid, readOnly, loadData, setSearchParams])

  /* Resume payment for an unpaid order */
  const payNow = async (orderId: string) => {
    if (payingId) return
    setPayingId(orderId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Please sign in again to continue.')
      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ order_id: orderId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Could not start the payment.')
      window.location.href = json.url as string
    } catch (e) {
      setPayingId(null)
      showToast('err', 'Payment could not be started', e instanceof Error ? e.message : undefined)
    }
  }

  /* Header badge reflects ANY active plan; the panel below follows the SELECTED plan */
  const anyActive = allSubs.some(s => subIsActive(s))
  const anyExpired = !anyActive && allSubs.length > 0

  /* Selected plan via the "All plans" dropdown — the whole panel shows its data */
  const sel = allSubs.find(s => s.id === viewSubId) ?? subscription
  const active = subIsActive(sel)
  const expired = subIsExpired(sel)
  const plan = sel?.plans ?? null
  const limit = sel?.bandwidth_limit_gb ?? 0
  const used = sel?.bandwidth_used_gb ?? 0
  const left = Math.max(0, limit - used)
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const subOptions = allSubs.map(s => ({
    value: s.id,
    label: `${s.plans?.name ?? 'Plan'}${subIsActive(s) ? (subIsExhausted(s) ? ' · data used up' : '') : ' · expired'}`,
  }))

  const invoices = useMemo<Invoice[]>(() => invoicesFromOrders(orders), [orders])

  const totalSpent = orders.filter(o => o.status === 'paid' || o.status === 'active').reduce((a, o) => a + Number(o.amount), 0)
  const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'active')
  const lastPaid = paidOrders[0]
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'awaiting_topup')

  const downloadInvoicePdf = () => {
    const inv = activeInvoice
    if (!inv || pdfBusy) return
    setPdfBusy(true)
    setPdfLbl('Generating PDF...')
    const customer = {
      name: profile?.username || profile?.email?.split('@')[0] || 'Customer',
      email: profile?.email ?? '',
      username: profile?.username ?? profile?.email?.split('@')[0] ?? '',
    }
    setTimeout(() => {
      try {
        generateInvoicePdf(inv, customer)
        setPdfBusy(false)
        setPdfLbl('PDF Downloaded')
        showToast('ok', 'PDF downloaded successfully.', 'SafestProxy-Invoice-' + inv.num + '.pdf')
        setTimeout(() => setPdfLbl('Download PDF'), 2000)
      } catch {
        setPdfBusy(false)
        setPdfLbl('Download PDF')
        showToast('err', 'Unable to complete this action. Please try again.')
      }
    }, 60)
  }

  if (activeInvoice) {
    const [lbl, cls] = INV_STATUS[activeInvoice.status] ?? ['PENDING', 'warn']
    return (
      <section className="section active">
        <div className="invoice-view show">
          <div className="inv-toolbar">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setActiveInvoice(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Back to Billing
            </button>
            <button className={cn('btn btn-primary', pdfBusy && 'loading')} type="button" disabled={pdfBusy} onClick={downloadInvoicePdf}>
              <span className="gen-spinner" />
              <svg className="gen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={pdfBusy ? { display: 'none' } : undefined}><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
              <span>{pdfLbl}</span>
            </button>
          </div>

          <div id="invoiceDocMount">
            <div className="inv-doc">
              <div className="inv-doc-head">
                <div className="inv-brand">
                  <img src={LOGO_URL} alt="SafestProxy logo" />
                  <div>
                    <div className="inv-brand-name">SafestProxy</div>
                    <div className="inv-brand-sub">Proxy Infrastructure &amp; Network Services</div>
                  </div>
                </div>
                <div>
                  <div className="inv-doc-title">INVOICE</div>
                  <div className="inv-doc-num">#{activeInvoice.num} · {activeInvoice.date}</div>
                </div>
              </div>

              <div className="inv-meta-grid">
                <div>
                  <div className="l">Billed to</div>
                  <div className="v">
                    {profile?.username || profile?.email?.split('@')[0] || 'Customer'}
                    <small>{profile?.email}</small>
                    <small>Username: {profile?.username ?? '—'}</small>
                  </div>
                </div>
                <div>
                  <div className="l">Plan details</div>
                  <div className="v">
                    {activeInvoice.plan}
                    <small>{activeInvoice.ptype} · {activeInvoice.allowance} · {activeInvoice.cycle}</small>
                    <small>Period: {activeInvoice.period}</small>
                  </div>
                </div>
                <div>
                  <div className="l">Payment status</div>
                  <div className="v"><span className={cn('tag dot', cls)} style={{ fontSize: 12, padding: '8px 16px' }}>{lbl}</span></div>
                </div>
              </div>

              <table className="inv-lines">
                <thead><tr><th>Description</th><th>Amount</th></tr></thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="strong">{activeInvoice.plan} — {activeInvoice.allowance} · {activeInvoice.cycle}</span>
                      <br /><span style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 400 }}>Billing period: {activeInvoice.period}</span>
                    </td>
                    <td>${activeInvoice.amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="inv-total-row">
                <div className="inv-total-box">
                  <div className="r"><span>Subtotal</span><span>${activeInvoice.amount.toFixed(2)}</span></div>
                  <div className="r"><span>Discount</span><span>$0.00</span></div>
                  <div className="r"><span>Tax</span><span>$0.00</span></div>
                  <div className="r total"><span>Total</span><span className="amt">${activeInvoice.amount.toFixed(2)}</span></div>
                </div>
              </div>

              <div className="inv-doc-foot">
                <span>Payment method: {activeInvoice.payMethod} · Transaction: {activeInvoice.txn}</span>
                <span>Thank you for choosing SafestProxy.</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="section active">
      <div className="sec-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div><h1>Billing</h1><p>Manage your subscription, payments and invoices.</p></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className={cn('badge-plan', !anyActive && !loading && 'warn')} style={{ textTransform: 'uppercase' }}>
            {loading ? 'Loading…' : anyActive ? (allSubs.filter(s => subIsActive(s)).length > 1 ? `${allSubs.filter(s => subIsActive(s)).length} plans active` : (subscription?.plans?.name ?? 'Active')) : anyExpired ? 'Plan expired' : 'No active plan'}
          </span>
          <span className={cn('tag', anyActive ? 'ok' : 'warn')}>{loading ? 'Balance …' : `Balance ${anyActive ? `${Math.max(0, (subscription?.bandwidth_limit_gb ?? 0) - (subscription?.bandwidth_used_gb ?? 0)).toFixed(2)} GB` : '$0.00'}`}</span>
        </div>
      </div>

      {verifyState === 'checking' && (
        <div className="pay-verifying">
          <span className="gen-spinner" />
          <span><strong>Confirming your payment…</strong> Your transaction is being verified on-chain. This usually takes a few seconds — your plan will activate automatically.</span>
        </div>
      )}
      {verifyState === 'waiting' && (
        <div className="pay-verifying">
          <span><strong>Payment received.</strong> Confirmation is still in progress — your plan will activate automatically once the payment is finalized. No need to pay again.</span>
        </div>
      )}

      {allSubs.length > 0 && (
        <div className="ov-plan-bar">
          <div className="ov-plan-bar-lbl">
            All plans
            <span className="ov-plan-bar-sub">{allSubs.filter(s => subIsActive(s)).length} active · {allSubs.length} total</span>
          </div>
          <div className="ov-plan-bar-select">
            <CustomSelect
              options={subOptions}
              value={sel?.id ?? ''}
              onChange={setViewSubId}
            />
          </div>
          {sel && (
            <span className={cn('tag dot', active ? 'ok' : subIsExhausted(sel) ? 'warn' : 'bad')}>
              {active ? (subIsExhausted(sel) ? 'Data used up' : 'Active') : 'Expired'}
            </span>
          )}
        </div>
      )}

      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="cur-plan-top">
          <div>
            <div className="inv-sec-lbl" style={{ marginBottom: 9 }}>{active ? 'Current plan' : 'Selected plan'}</div>
            <div className="cur-plan-name">{sel ? (plan?.name ?? 'Active plan') : expired ? 'Plan expired' : 'No active plan'}</div>
            <div className="cur-plan-type">{active ? (plan ? PRODUCT_META[productOf(plan.name)].name : 'Proxy plan') : expired ? 'Renew or upgrade your plan to continue' : 'Add funds or choose a plan to get started'}</div>
          </div>
          <div>
            <div className="cur-plan-price">${active && plan ? Number(plan.price).toFixed(2) : '0.00'} <span>/ {plan && productOf(plan.name) === 'unlimited_residential' ? periodOf(plan) : 'month'}</span></div>
            <div style={{ textAlign: 'right', marginTop: 9 }}>
              <span className={cn('tag', active ? 'ok dot' : 'neutral')}>{active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
        <div className="usage-ring-wrap" style={{ marginBottom: 20 }}>
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{used.toFixed(1)} GB used</span>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{limit > 0 ? `${tierLong(limit)} total` : 'Unlimited'}</span>
        </div>
        <div className="cur-plan-meta">
          <div className="m"><div className="l">Remaining</div><div className="v">{active ? (limit > 0 ? `${left.toFixed(2)} GB` : 'Unlimited') : '—'}</div></div>
          <div className="m"><div className="l">Renews on</div><div className="v">{active && sel?.expiry_date ? fmtDate(new Date(sel.expiry_date)) : '—'}</div></div>
          <div className="m"><div className="l">Billing cycle</div><div className="v">{active && plan ? (productOf(plan.name) === 'unlimited_residential' ? periodOf(plan as never) + ' billing' : 'Monthly') : '—'}</div></div>
          <div className="m"><div className="l">Payment method</div><div className="v">{lastPaid ? 'Cryptocurrency' : '—'}</div></div>
        </div>
        {!readOnly && <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate('/plans')}>View plans</button>}
      </div>

      <div className="sum-grid">
        <div className="stat-card">
          <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg></div>
          <div className="val">${totalSpent.toFixed(2)}</div>
          <div className="lbl">Total spent · all-time payments</div>
        </div>
        <div className="stat-card">
          <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></div>
          <div className="val">{active && plan ? `$${Number(plan.price).toFixed(2)}` : '$0.00'}</div>
          <div className="lbl">Current billing · {active ? `renews ${sel?.expiry_date ? fmtDate(new Date(sel.expiry_date)) : 'soon'}` : 'no upcoming payment'}</div>
        </div>
        <div className="stat-card">
          <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6" /></svg></div>
          <div className="val">{orders.length}</div>
          <div className="lbl">Invoices · total issued</div>
        </div>
        <div className="stat-card">
          <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6L9 17l-5-5" /></svg></div>
          <div className="val">{orders.length === 0 ? '—' : orders.some(o => o.status === 'awaiting_topup' || o.status === 'pending') ? 'Pending' : 'Paid'}</div>
          <div className="lbl">Payment status · {orders.length === 0 ? 'no payments yet' : orders.some(o => o.status === 'awaiting_topup' || o.status === 'pending') ? 'awaiting top-up' : 'all settled'}</div>
        </div>
      </div>

      {!readOnly && !loading && pendingOrders.length > 0 && (
        <div className="panel pay-pending-panel">
          <div className="panel-head">
            <div><h3>Pending payments</h3><p>Complete the payment to activate your plan instantly.</p></div>
          </div>
          {pendingOrders.map(o => (
            <div className="pay-pending-row" key={o.id}>
              <div className="pay-pending-info">
                <div className="pay-pending-name">{o.plans?.name ?? 'Plan'}</div>
                <div className="pay-pending-meta">Created {fmtDate(new Date(o.created_at))} · unpaid</div>
              </div>
              <span className="pay-pending-amount">${Number(o.amount).toFixed(2)}</span>
              <button
                className={cn('btn btn-primary btn-sm', payingId === o.id && 'loading')}
                type="button"
                disabled={!!payingId}
                onClick={() => payNow(o.id)}
              >
                <span className="gen-spinner" />
                <span>{payingId === o.id ? 'Connecting…' : 'Pay now'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div><h3>Invoice history</h3><p>View and download your SafestProxy invoices.</p></div>
        </div>
        {!loading && invoices.length > 0 && (
          <div className="inv-table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Plan</th><th>Billing period</th><th>Amount</th><th>Status</th><th>Date</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const [lbl, cls] = INV_STATUS[inv.status] ?? ['PENDING', 'warn']
                  return (
                    <tr key={i}>
                      <td><span className="inv-num">#{inv.num}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{inv.plan}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{inv.period}</td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>${inv.amount.toFixed(2)}</td>
                      <td><span className={cn('tag dot', cls)}>{lbl}</span></td>
                      <td className="mono" style={{ fontSize: 12 }}>{inv.date}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setActiveInvoice(inv); window.scrollTo(0, 0) }}>View invoice</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && invoices.length === 0 && (
          <div className="inv-empty show">
            <div className="ae-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6" /></svg></div>
            <h4>No invoices yet</h4>
            <p>Your invoices will appear here after your first successful payment.</p>
            {!readOnly && <button className="btn btn-primary" type="button" onClick={() => navigate('/plans')}>Explore plans</button>}
          </div>
        )}
      </div>
    </section>
  )
}
