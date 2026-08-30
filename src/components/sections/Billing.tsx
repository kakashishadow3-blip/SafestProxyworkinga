import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn, fmtDate } from '@/lib/utils'
import { subIsActive, subIsExpired, subIsExhausted } from '@/lib/subscription'
import { showToast } from '@/lib/toast'
import { productOf, PRODUCT_META, tierLong, threadsOf, periodOf } from '@/lib/plans'
import type { Order, Profile, Subscription } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

/* Invoice status derived from the order row (backend-owned) */
const INV_STATUS: Record<string, [string, string]> = {
  paid: ['PAID', 'ok'],
  active: ['PAID', 'ok'],
  pending: ['PENDING', 'warn'],
  awaiting_topup: ['PENDING', 'warn'],
  cancelled: ['FAILED', 'bad'],
}

interface Invoice {
  num: string
  plan: string
  ptype: string
  allowance: string
  cycle: string
  period: string
  amount: number
  status: string
  date: string
  payMethod: string
  txn: string
}

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
    setSubscription(subs.find(s => subIsActive(s)) ?? subs[0] ?? null)
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

  const active = subIsActive(subscription)
  const expired = subIsExpired(subscription)
  const plan = subscription?.plans ?? null
  const limit = subscription?.bandwidth_limit_gb ?? 0
  const used = subscription?.bandwidth_used_gb ?? 0
  const left = Math.max(0, limit - used)
  const pct = active && limit > 0 ? Math.min(100, (used / limit) * 100) : 0

  const invoices = useMemo<Invoice[]>(() => orders.map(o => {
    const p = o.plans
    const product = p ? productOf(p.name) : 'residential'
    const unlimited = product === 'unlimited_residential'
    const created = new Date(o.created_at)
    const end = p ? new Date(created.getTime() + p.duration_days * 86400000) : created
    const uPeriod = p ? periodOf({ duration_days: p.duration_days } as { duration_days: number } as Parameters<typeof periodOf>[0]) : null
    const cycleLabel = uPeriod === 'day' ? 'Daily' : uPeriod === 'week' ? 'Weekly' : 'Monthly'
    return {
      num: 'SP-' + o.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      plan: p?.name ?? 'Plan',
      ptype: PRODUCT_META[product].name,
      allowance: p ? (unlimited ? `${threadsOf(p as Parameters<typeof threadsOf>[0])} threads` : tierLong(p.bandwidth_gb)) : '—',
      cycle: p ? cycleLabel : '—',
      period: p ? `${fmtDate(created)} – ${fmtDate(end)}` : fmtDate(created),
      amount: Number(o.amount),
      status: o.status,
      date: fmtDate(created),
      payMethod: 'Cryptocurrency',
      txn: o.cryptomus_order_id ?? '—',
    }
  }), [orders])

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
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
        const PW = 210, M = 18, CW = PW - M * 2
        const BLUE: [number, number, number] = [67, 97, 238]
        const INK: [number, number, number] = [24, 28, 42]
        const DIM: [number, number, number] = [110, 116, 139]
        const LINE: [number, number, number] = [228, 231, 240]
        const money = (n: number) => '$' + n.toFixed(2)
        let y = 24

        /* header */
        doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...BLUE)
        doc.text('SafestProxy', M, y)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DIM)
        doc.text('Proxy Infrastructure & Network Services', M, y + 5.5)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK)
        doc.text('INVOICE', PW - M, y - 2, { align: 'right' })
        doc.setFontSize(10.5); doc.setTextColor(...BLUE)
        doc.text('#' + inv.num, PW - M, y + 4, { align: 'right' })
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DIM)
        doc.text(inv.date, PW - M, y + 9.5, { align: 'right' })
        y += 16
        doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(M, y, PW - M, y)
        y += 9

        /* billed to / status */
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DIM)
        doc.text('BILLED TO', M, y)
        doc.text('PAYMENT STATUS', PW - M, y, { align: 'right' })
        y += 5.5
        doc.setFontSize(11); doc.setTextColor(...INK)
        doc.text(customer.name, M, y)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...DIM)
        doc.text(customer.email, M, y + 5)
        doc.text('Username: ' + customer.username, M, y + 10)
        const [stLbl] = INV_STATUS[inv.status] ?? ['PENDING', 'warn']
        const stCol: [[number, number, number], [number, number, number]] =
          inv.status === 'paid' || inv.status === 'active' ? [[21, 128, 61], [220, 252, 231]]
            : inv.status === 'cancelled' ? [[185, 28, 28], [254, 226, 226]]
              : [[180, 83, 9], [254, 243, 199]]
        const stW = doc.getTextWidth(stLbl) + 12
        doc.setFillColor(...stCol[1])
        doc.roundedRect(PW - M - stW, y - 4.5, stW, 8, 2, 2, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...stCol[0])
        doc.text(stLbl, PW - M - stW / 2, y + 0.8, { align: 'center' })
        y += 18

        /* plan details */
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DIM)
        doc.text('PLAN DETAILS', M, y)
        y += 4
        const cells: [string, string][] = [['Plan', inv.plan], ['Proxy type', inv.ptype], ['Data allowance', inv.allowance], ['Subscription', inv.cycle]]
        const cw = (CW - 9) / 2, ch = 15
        cells.forEach((c, ci) => {
          const cx = M + (ci % 2) * (cw + 9), cy = y + Math.floor(ci / 2) * (ch + 4)
          doc.setFillColor(246, 247, 251); doc.setDrawColor(...LINE)
          doc.roundedRect(cx, cy, cw, ch, 2, 2, 'FD')
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DIM)
          doc.text(c[0].toUpperCase(), cx + 4, cy + 5.5)
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
          doc.text(c[1], cx + 4, cy + 11.5)
        })
        y += ch * 2 + 4 + 10

        /* line items */
        doc.setFillColor(...BLUE)
        doc.rect(M, y, CW, 8.5, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255)
        doc.text('DESCRIPTION', M + 4, y + 5.8)
        doc.text('AMOUNT', PW - M - 4, y + 5.8, { align: 'right' })
        y += 8.5
        doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINE)
        doc.rect(M, y, CW, 14, 'FD')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
        doc.text(inv.plan + ' — ' + inv.allowance + ' · ' + inv.cycle, M + 4, y + 5.8)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...DIM)
        doc.text('Billing period: ' + inv.period, M + 4, y + 10.8)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
        doc.text(money(inv.amount), PW - M - 4, y + 5.8, { align: 'right' })
        y += 14 + 8

        /* totals */
        const tX = PW - M - 64, tV = PW - M
        const tRow = (l: string, v: string, bold = false) => {
          doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10.5 : 9)
          doc.setTextColor(...(bold ? INK : DIM))
          doc.text(l, tX + 4, y + 5.2)
          doc.setTextColor(...INK)
          doc.text(v, tV - 4, y + 5.2, { align: 'right' })
          y += 7
        }
        tRow('Subtotal', money(inv.amount))
        tRow('Discount', '$0.00')
        tRow('Tax', '$0.00')
        doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(tX, y - 1.5, tV, y - 1.5)
        y += 2.5
        tRow('Total', money(inv.amount), true)
        y += 6

        /* payment info */
        doc.setFillColor(246, 247, 251); doc.setDrawColor(...LINE)
        doc.roundedRect(M, y, CW, 16, 2, 2, 'FD')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DIM)
        doc.text('PAYMENT METHOD', M + 4, y + 5.5)
        doc.text('TRANSACTION ID', M + CW / 2 + 2, y + 5.5)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK)
        doc.text(inv.payMethod, M + 4, y + 11.5)
        doc.text(inv.txn, M + CW / 2 + 2, y + 11.5)
        y += 16 + 12

        /* footer */
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DIM)
        doc.text('Thank you for choosing SafestProxy.', PW / 2, y, { align: 'center' })
        doc.setFontSize(7.5)
        doc.text('SafestProxy · app.safestproxy.com · support@safestproxy.com', PW / 2, 285, { align: 'center' })

        doc.save('SafestProxy-Invoice-' + inv.num + '.pdf')
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
          <span className={cn('badge-plan', !active && !loading && 'warn')} style={{ textTransform: 'uppercase' }}>
            {loading ? 'Loading…' : active ? (allSubs.filter(s => subIsActive(s)).length > 1 ? `${allSubs.filter(s => subIsActive(s)).length} plans active` : (plan?.name ?? 'Active')) : expired ? 'Plan expired' : 'No active plan'}
          </span>
          <span className={cn('tag', active ? 'ok' : 'warn')}>{loading ? 'Balance …' : `Balance ${active ? `${left.toFixed(2)} GB` : '$0.00'}`}</span>
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

      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="cur-plan-top">
          <div>
            <div className="inv-sec-lbl" style={{ marginBottom: 9 }}>Current plan</div>
            <div className="cur-plan-name">{active ? (plan?.name ?? 'Active plan') : expired ? 'Plan expired' : 'No active plan'}</div>
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
          <div className="m"><div className="l">Renews on</div><div className="v">{active && subscription?.expiry_date ? fmtDate(new Date(subscription.expiry_date)) : '—'}</div></div>
          <div className="m"><div className="l">Billing cycle</div><div className="v">{active && plan ? (productOf(plan.name) === 'unlimited_residential' ? periodOf(plan as never) + ' billing' : 'Monthly') : '—'}</div></div>
          <div className="m"><div className="l">Payment method</div><div className="v">{lastPaid ? 'Cryptocurrency' : '—'}</div></div>
        </div>
        {!readOnly && <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate('/plans')}>View plans</button>}
      </div>

      {allSubs.length > 1 && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-head">
            <div><h3>All your plans</h3><p>{allSubs.filter(s => subIsActive(s)).length} active · {allSubs.length} total — each plan has its own traffic balance and expiry.</p></div>
          </div>
          {allSubs.map(s => {
            const lim = s.bandwidth_limit_gb ?? 0
            const usd = s.bandwidth_used_gb ?? 0
            const usedPct = lim > 0 ? Math.min(100, (usd / lim) * 100) : 0
            const st: [string, string] = subIsExpired(s) ? ['Expired', 'bad'] : subIsExhausted(s) ? ['Data used up', 'warn'] : ['Active', 'ok']
            return (
              <div className="myplan-row" key={s.id}>
                <div className="myplan-info">
                  <div className="myplan-name">{s.plans?.name ?? 'Plan'}</div>
                  <div className="myplan-meta">
                    {s.plans ? PRODUCT_META[productOf(s.plans.name)].name : 'Proxy'} ·
                    {s.expiry_date ? ` expires ${fmtDate(new Date(s.expiry_date))}` : ' no expiry'}
                  </div>
                </div>
                <div className="myplan-usage">
                  <span className="mono">{lim > 0 ? `${usd.toFixed(1)} / ${tierLong(lim)} used` : 'Unlimited traffic'}</span>
                  {lim > 0 && <div className="myplan-bar"><div className={`myplan-bar-fill${usedPct >= 100 ? ' bad' : usedPct >= 80 ? ' warn' : ''}`} style={{ width: `${usedPct}%` }} /></div>}
                </div>
                <span className={cn('tag dot', st[1])}>{st[0]}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="sum-grid">
        <div className="stat-card">
          <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg></div>
          <div className="val">${totalSpent.toFixed(2)}</div>
          <div className="lbl">Total spent · all-time payments</div>
        </div>
        <div className="stat-card">
          <div className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></div>
          <div className="val">{active && plan ? `$${Number(plan.price).toFixed(2)}` : '$0.00'}</div>
          <div className="lbl">Current billing · {active ? `renews ${subscription?.expiry_date ? fmtDate(new Date(subscription.expiry_date)) : 'soon'}` : 'no upcoming payment'}</div>
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
