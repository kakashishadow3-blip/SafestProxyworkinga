import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import PaymentModal from '@/components/ui/PaymentModal'
import {
  PRODUCT_META, PRODUCT_ORDER, ProductKey, UPeriod, U_PERIOD_LABELS,
  productOf, tierLabel, tierLong, threadsOf, periodOf, POPULAR_TIER_GB,
} from '@/lib/plans'
import type { Plan } from '@/types'

const TIER_ORDER = [52, 65, 135, 240, 520, 760, 1000, 2000]
const THREAD_ORDER = [100, 200, 400, 500, 700, 1000]

const CHECK_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
)

interface Props {
  userId?: string // admin viewing another user's dashboard (read-only CTA)
}

export default function Plans({ userId }: Props) {
  const { user } = useAuth()
  const uid = userId ?? user?.id
  const readOnly = !!userId

  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState<ProductKey>('residential')
  const [tier, setTier] = useState<number>(POPULAR_TIER_GB)
  const [period, setPeriod] = useState<UPeriod>('day')
  const [threads, setThreads] = useState(100)
  const [payOpen, setPayOpen] = useState(false)
  const [payBusy, setPayBusy] = useState(false)
  const [priceAnim, setPriceAnim] = useState(false)
  const [searchParams] = useSearchParams()

  /* Sidebar dropdown deep-links: /plans?product=mobile opens that product tab directly */
  useEffect(() => {
    const p = searchParams.get('product') as ProductKey | null
    if (p && PRODUCT_ORDER.includes(p) && p !== product) setProduct(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('plans').select('*').order('price', { ascending: true })
      setPlans(((data as Plan[] | null) ?? []).filter(p => p.is_active !== false))
      setLoading(false)
    })()
  }, [])

  const byProduct = useMemo(() => {
    const map: Record<ProductKey, Plan[]> = {
      residential: [], mobile: [], unlimited_residential: [], static_residential: [], datacenter: [],
    }
    plans.forEach(p => map[productOf(p.name)].push(p))
    return map
  }, [plans])

  const isUnlimited = product === 'unlimited_residential'

  /* Resolve the exact DB plan row for the current on-screen selection */
  const selectedPlan = useMemo(() => {
    const list = byProduct[product]
    if (isUnlimited) {
      return list.find(p => threadsOf(p) === threads && periodOf(p) === period) ?? null
    }
    return list.find(p => p.bandwidth_gb === tier) ?? null
  }, [byProduct, product, isUnlimited, tier, threads, period])

  const price = selectedPlan ? Number(selectedPlan.price) : null
  const meta = PRODUCT_META[product]
  const ribbonShown = isUnlimited ? period === 'week' : tier === POPULAR_TIER_GB

  const swapPrice = (fn: () => void) => {
    setPriceAnim(true)
    setTimeout(() => { fn(); setPriceAnim(false) }, 120)
  }

  /* Choose plan → open the payment-method popup (Cryptomus checkout) */
  const choosePlan = () => {
    if (readOnly || !uid) return
    if (!selectedPlan) {
      showToast('err', 'Plan unavailable', 'This combination is not available right now — please pick another tier.')
      return
    }
    setPayOpen(true)
  }

  const startCryptoPayment = async () => {
    if (!selectedPlan || payBusy) return
    setPayBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setPayBusy(false)
        setPayOpen(false)
        showToast('err', 'Session expired', 'Please sign in again to continue.')
        return
      }
      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan_id: selectedPlan.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Could not start the payment.')
      window.location.href = json.url as string
    } catch (e) {
      setPayBusy(false)
      showToast('err', 'Payment could not be started', e instanceof Error ? e.message : undefined)
    }
  }

  return (
    <section className="section active">
      <div className="sec-head">
        <h1>Available Plans</h1>
        <p>Choose a product, then pick the traffic tier that fits your workload.</p>
      </div>

      <div className="plan-tabs">
        {PRODUCT_ORDER.map(p => (
          <button
            key={p}
            className={cn('plan-tab', product === p && 'active')}
            type="button"
            onClick={() => { if (p !== product) swapPrice(() => setProduct(p)) }}
          >
            {PRODUCT_META[p].tabLabel}
          </button>
        ))}
      </div>

      {!isUnlimited && (
        <div className="tier-wrap">
          <div className="tier-label">Select traffic tier</div>
          <div className="tier-row anim-in">
            {TIER_ORDER.map(t => (
              <button
                key={t}
                className={cn('tier-btn', tier === t && 'active')}
                type="button"
                onClick={() => { if (t !== tier) swapPrice(() => setTier(t)) }}
              >
                {tierLabel(t)}
              </button>
            ))}
          </div>
        </div>
      )}

      {isUnlimited && (
        <div className="u-selector-wrap show">
          <div className="u-tabs-wrap">
            <div className="u-tabs">
              {(['day', 'week', 'month'] as UPeriod[]).map(p => (
                <button
                  key={p}
                  className={cn('u-tab', period === p && 'active')}
                  type="button"
                  onClick={() => { if (p !== period) swapPrice(() => setPeriod(p)) }}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="u-threads-label-row">
            <span className="tier-label" style={{ marginBottom: 0 }}>Select threads</span>
            <span className="u-info-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
              <span className="u-tooltip">Threads = how many connections run in parallel at once. More threads means more simultaneous requests — faster scraping and easier scaling.</span>
            </span>
          </div>
          <div className="u-threads anim-in">
            {THREAD_ORDER.map(t => (
              <button
                key={t}
                className={cn('u-thread-btn', threads === t && 'active')}
                type="button"
                onClick={() => { if (t !== threads) swapPrice(() => setThreads(t)) }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pcard">
        <div className="pcard-ribbon-wrap">
          <span className={cn('pcard-ribbon', ribbonShown && 'show')}>Most Popular</span>
        </div>
        <div className="pcard-body">
          <div className="pcard-left">
            <div className="pcard-name">{meta.name}</div>
            <div className="pcard-price-row">
              <span className="pcard-cur">$</span>
              <span className="pcard-amount" style={{ transform: priceAnim ? 'scale(0.85)' : 'scale(1)', opacity: priceAnim ? 0.4 : 1 }}>
                {loading ? '—' : price !== null ? price : '—'}
              </span>
              <span className="pcard-per">{isUnlimited ? U_PERIOD_LABELS[period] : '/mo'}</span>
            </div>
            <div className="pcard-gb">
              <strong>{isUnlimited ? threads : tierLong(tier)}</strong>{' '}
              <span>{isUnlimited ? 'threads · unlimited traffic' : 'proxy traffic · monthly'}</span>
            </div>
            {!readOnly && (
              <button className="pcard-cta" type="button" onClick={choosePlan} disabled={payBusy || loading} style={{ border: 'none', cursor: 'pointer' }}>
                <span>{payBusy ? 'Connecting…' : 'Choose plan'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )}
            <div className="pcard-secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Secure checkout, SSL protected
            </div>
          </div>
          <div className="pcard-divider" />
          <ul className="pcard-features">
            {meta.features.map(f => <li key={f}>{CHECK_SVG}{f}</li>)}
          </ul>
        </div>
      </div>

      {selectedPlan && (
        <PaymentModal
          open={payOpen}
          planName={selectedPlan.name}
          price={Number(selectedPlan.price)}
          busy={payBusy}
          onClose={() => setPayOpen(false)}
          onCrypto={startCryptoPayment}
        />
      )}
    </section>
  )
}
