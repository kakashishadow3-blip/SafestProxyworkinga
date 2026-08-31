import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  planName: string
  price: number
  busy: boolean
  onClose: () => void
  onCrypto: () => void
}

const PKR_RATE = 288

const COUNTRIES = [
  'Pakistan', 'United States', 'United Kingdom', 'United Arab Emirates', 'Saudi Arabia', 'India', 'Bangladesh',
  'Canada', 'Australia', 'Germany', 'France', 'Netherlands', 'Spain', 'Italy', 'Turkey', 'Qatar', 'Kuwait',
  'Oman', 'Bahrain', 'Malaysia', 'Indonesia', 'Singapore', 'China', 'Japan', 'South Korea', 'Hong Kong',
  'Brazil', 'Mexico', 'Argentina', 'South Africa', 'Nigeria', 'Egypt', 'Kenya', 'Russia', 'Ukraine', 'Poland',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Switzerland', 'Austria', 'Belgium', 'Ireland', 'Portugal', 'Greece',
  'New Zealand', 'Philippines', 'Vietnam', 'Thailand', 'Sri Lanka', 'Nepal', 'Afghanistan', 'Iraq', 'Iran',
]

/* ---- formatters (formatting only — card data NEVER leaves the browser) ---- */
const fmtCardNumber = (v: string) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')

const fmtExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)} / ${d.slice(2)}`
}

const fmtCvc = (v: string) => v.replace(/\D/g, '').slice(0, 4)

/* ---- validators ---- */
const luhnOk = (digits: string) => {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

/* catches keyboard-mash like "asdasd", "fafafa", "aaaa" */
const isGibberish = (s: string) => {
  const words = s.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
  return words.some(w =>
    /(.)\1{2,}/.test(w) ||          // aaa, sss
    /(.{2,4})\1{2,}/.test(w) ||     // fafafa, asdasdasd
    /^(.{2,4})\1+$/.test(w)         // fafa, sadsad, asdasd
  )
}

const nameOk = (s: string) => {
  const t = s.trim()
  if (!/^[A-Za-z][A-Za-z .'-]{3,}$/.test(t)) return false
  const words = t.split(/\s+/).filter(w => w.replace(/[.'-]/g, '').length >= 2)
  return words.length >= 2 && !isGibberish(t)
}

const addressOk = (s: string) => {
  const t = s.trim()
  if (t.length < 6) return false
  if (!/[A-Za-z]/.test(t)) return false
  if (!/\d/.test(t) && !/\s/.test(t)) return false   // needs a house number or multiple words
  return !isGibberish(t)
}

const cityOk = (s: string) => {
  const t = s.trim()
  return /^[A-Za-z][A-Za-z .'-]{2,}$/.test(t) && !isGibberish(t)
}

const postalOk = (s: string) => {
  const t = s.trim()
  return /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(t) && /\d/.test(t)
}

const expiryOk = (v: string) => {
  const m = v.replace(/\D/g, '')
  if (m.length !== 4) return false
  const mm = Number(m.slice(0, 2))
  const yy = Number(m.slice(2))
  if (mm < 1 || mm > 12) return false
  const now = new Date()
  const curYy = now.getFullYear() % 100
  const curMm = now.getMonth() + 1
  return yy > curYy || (yy === curYy && mm >= curMm)
}

type Step = 'method' | 'card' | 'crypto'
type Errs = Partial<Record<'card' | 'expiry' | 'cvc' | 'name' | 'addr1' | 'addr2' | 'suburb' | 'city' | 'postal', boolean>>

export default function PaymentModal({ open, planName, price, busy, onClose, onCrypto }: Props) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('method')
  const [method, setMethod] = useState<'card' | 'crypto'>('card')
  const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR')

  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [holderName, setHolderName] = useState('')
  const [country, setCountry] = useState('Pakistan')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [suburb, setSuburb] = useState('')
  const [city, setCity] = useState('')
  const [postal, setPostal] = useState('')

  const [processing, setProcessing] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [errs, setErrs] = useState<Errs>({})
  const [banner, setBanner] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [troubleOpen, setTroubleOpen] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)

  /* reset everything each time the modal opens */
  useEffect(() => {
    if (open) {
      setStep('method'); setMethod('card'); setCurrency('PKR')
      setCardNumber(''); setExpiry(''); setCvc(''); setHolderName('')
      setCountry('Pakistan'); setAddress1(''); setAddress2(''); setSuburb(''); setCity(''); setPostal('')
      setProcessing(false); setDeclined(false); setErrs({}); setBanner(''); setAttempts(0); setTroubleOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !processing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, processing, onClose])

  /* bring the banner into view whenever it appears (modal body is scrollable) */
  useEffect(() => {
    if (banner || declined) bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [banner, declined])

  if (!open) return null

  const pkr = Math.round(price * PKR_RATE)
  const fee = price * 0.02
  const cryptoTotal = price + fee

  const clearErr = (k: keyof Errs) => setErrs(e => (e[k] ? { ...e, [k]: false } : e))

  /* Attempt metadata ONLY — plan / country / city / postal. Card number, CVC, name and
     street address are NEVER transmitted or stored. */
  const logAttempt = (cur: 'PKR' | 'USD', ctry: string, cty: string, pc: string) => {
    if (!user) return
    supabase.from('card_payment_attempts').insert({
      user_id: user.id,
      plan_name: planName,
      amount_usd: price,
      currency: cur,
      country: ctry,
      city: cty,
      postal_code: pc,
    }).then(() => { /* fire and forget */ })
  }

  const handlePay = () => {
    if (processing || busy) return
    setDeclined(false)

    const e: Errs = {}
    const digits = cardNumber.replace(/\D/g, '')
    if (digits.length < 15 || digits.length > 16 || !luhnOk(digits)) e.card = true
    if (!expiryOk(expiry)) e.expiry = true
    if (cvc.length < 3) e.cvc = true
    if (!nameOk(holderName)) e.name = true
    if (!addressOk(address1)) e.addr1 = true
    if (address2.trim() && isGibberish(address2)) e.addr2 = true
    if (suburb.trim() && (suburb.trim().length < 3 || isGibberish(suburb))) e.suburb = true
    if (!cityOk(city)) e.city = true
    if (!postalOk(postal)) e.postal = true

    setErrs(e)
    if (Object.keys(e).length > 0) {
      setBanner('Please correct the highlighted fields — the details entered do not look valid.')
      return
    }

    setBanner('')
    setProcessing(true)
    const cur = currency, ctry = country, cty = city.trim(), pc = postal.trim()
    setTimeout(() => {
      setProcessing(false)
      setDeclined(true)
      setCvc('')
      logAttempt(cur, ctry, cty, pc)
      const n = attempts + 1
      setAttempts(n)
      if (n >= 3) setTroubleOpen(true)
    }, 1400)
  }

  const goCrypto = () => setStep('crypto')

  const backToMethods = (
    <button
      type="button"
      className="spm-back"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: '4px 0', margin: '2px 0 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#0A6CFF', fontFamily: 'inherit' }}
      onClick={() => { setStep('method'); setBanner(''); setDeclined(false); setErrs({}) }}
      disabled={busy || processing}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      All payment methods
    </button>
  )

  return (
    <div className="modal-backdrop show" onClick={busy || processing ? undefined : onClose}>
      <div className="spm-card" role="dialog" aria-modal="true" aria-label="Make a payment" onClick={e => e.stopPropagation()}>

        <div className="spm-head">
          <div>
            <h3 className="spm-title">Make a payment</h3>
            <p className="spm-sub">Plan payment · {planName}</p>
          </div>
          <button type="button" className="spm-close" aria-label="Close" onClick={onClose} disabled={busy || processing}>✕</button>
        </div>

        {/* ============ STEP 1: choose method ============ */}
        {step === 'method' && (
          <div className="spm-body">
            <div className="spm-lbl">Choose payment method</div>
            <div className="pm-opts" role="radiogroup" aria-label="Payment method">
              <button
                type="button" role="radio" aria-checked={method === 'card'}
                className={cn('pm-opt', method === 'card' && 'on')}
                onClick={() => setMethod('card')}
              >
                <span className="pm-radio"><span className="pm-radio-dot" /></span>
                <span className="pm-opt-main">
                  <span className="pm-opt-name">Card Payment</span>
                  <span className="pm-opt-sub">Visa, Mastercard — powered by Stripe</span>
                </span>
                <span className="pm-badges">
                  <span className="pm-visa">VISA</span>
                  <span className="pm-mc" aria-hidden="true"><i className="pm-mc-l" /><i className="pm-mc-r" /></span>
                </span>
              </button>

              <button
                type="button" role="radio" aria-checked={method === 'crypto'}
                className={cn('pm-opt', method === 'crypto' && 'on')}
                onClick={() => setMethod('crypto')}
              >
                <span className="pm-radio"><span className="pm-radio-dot" /></span>
                <span className="pm-opt-main">
                  <span className="pm-opt-name">Cryptocurrency</span>
                  <span className="pm-opt-sub">Bitcoin, USDT, Ethereum & more</span>
                </span>
                <span className="pm-badges">
                  <span className="pm-coin" style={{ background: '#26A17B' }}>₮</span>
                  <span className="pm-coin" style={{ background: '#F7931A' }}>₿</span>
                  <span className="pm-coin" style={{ background: '#627EEA' }}>Ξ</span>
                </span>
              </button>
            </div>

            <button
              type="button"
              className="spm-pay"
              onClick={() => setStep(method)}
            >
              Continue
            </button>
          </div>
        )}

        {/* ============ STEP 2: card form ============ */}
        {step === 'card' && (
          <div className="spm-body">
            {backToMethods}

            <div className="spm-lbl">Choose currency</div>
            <div className="spm-cur-row">
              <button type="button" className={cn('spm-cur', currency === 'PKR' && 'on')} onClick={() => setCurrency('PKR')}>
                <span className="spm-cur-flag">₨</span> PKR {pkr.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
              </button>
              <button type="button" className={cn('spm-cur', currency === 'USD' && 'on')} onClick={() => setCurrency('USD')}>
                <span className="spm-cur-flag">$</span> {price.toFixed(2)} USD
              </button>
            </div>
            <div className="spm-rate">1 USD = {PKR_RATE.toFixed(4)} PKR</div>

            <div className="spm-lbl" style={{ marginTop: 18 }}>Payment method</div>
            <div className="spm-method">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
              Card
            </div>

            <div className="spm-group">
              <label className="spm-flbl">Card information</label>
              <div className="spm-fieldset">
                <div className={cn('spm-frow spm-cardno', errs.card && 'err')}>
                  <input
                    type="text" inputMode="numeric" autoComplete="cc-number"
                    placeholder="1234 1234 1234 1234"
                    value={cardNumber}
                    onChange={e => { setCardNumber(fmtCardNumber(e.target.value)); clearErr('card') }}
                  />
                  <span className="spm-brands">
                    <span className="pm-visa">VISA</span>
                    <span className="pm-mc" aria-hidden="true"><i className="pm-mc-l" /><i className="pm-mc-r" /></span>
                  </span>
                </div>
                <div className="spm-frow spm-split">
                  <input
                    className={cn(errs.expiry && 'err')}
                    type="text" inputMode="numeric" autoComplete="cc-exp"
                    placeholder="MM / YY"
                    value={expiry}
                    onChange={e => { setExpiry(fmtExpiry(e.target.value)); clearErr('expiry') }}
                  />
                  <input
                    className={cn(errs.cvc && 'err')}
                    type="text" inputMode="numeric" autoComplete="cc-csc"
                    placeholder="CVC"
                    value={cvc}
                    onChange={e => { setCvc(fmtCvc(e.target.value)); clearErr('cvc') }}
                  />
                </div>
              </div>
            </div>

            <div className="spm-group">
              <label className="spm-flbl">Cardholder name</label>
              <div className="spm-fieldset">
                <div className={cn('spm-frow', errs.name && 'err')}>
                  <input
                    type="text" autoComplete="cc-name"
                    placeholder="Full name on card"
                    value={holderName}
                    onChange={e => { setHolderName(e.target.value); clearErr('name') }}
                  />
                </div>
              </div>
            </div>

            <div className="spm-group">
              <label className="spm-flbl">Billing address</label>
              <div className="spm-fieldset">
                <div className="spm-frow">
                  <select value={country} onChange={e => setCountry(e.target.value)} autoComplete="country-name">
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className={cn('spm-frow', errs.addr1 && 'err')}>
                  <input type="text" placeholder="Address line 1" value={address1} onChange={e => { setAddress1(e.target.value); clearErr('addr1') }} autoComplete="address-line1" />
                </div>
                <div className={cn('spm-frow', errs.addr2 && 'err')}>
                  <input type="text" placeholder="Address line 2" value={address2} onChange={e => { setAddress2(e.target.value); clearErr('addr2') }} autoComplete="address-line2" />
                </div>
                <div className={cn('spm-frow', errs.suburb && 'err')}>
                  <input type="text" placeholder="Suburb" value={suburb} onChange={e => { setSuburb(e.target.value); clearErr('suburb') }} autoComplete="address-level3" />
                </div>
                <div className="spm-frow spm-split">
                  <input
                    className={cn(errs.city && 'err')}
                    type="text" placeholder="City" value={city}
                    onChange={e => { setCity(e.target.value); clearErr('city') }} autoComplete="address-level2"
                  />
                  <input
                    className={cn(errs.postal && 'err')}
                    type="text" placeholder="Postal code" value={postal}
                    onChange={e => { setPostal(e.target.value); clearErr('postal') }} autoComplete="postal-code"
                  />
                </div>
              </div>
            </div>

            {(banner || declined) && (
              <div className="spm-decline" role="alert" ref={bannerRef}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none', marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                <span>{declined ? 'Your card was declined. Please try a different card, or choose another payment method below.' : banner}</span>
              </div>
            )}

            <button
              type="button"
              className={cn('spm-pay', processing && 'loading')}
              onClick={handlePay}
              disabled={processing || busy}
            >
              {processing ? <span className="gen-spinner" /> : null}
              <span>{processing ? 'Processing…' : 'Pay'}</span>
            </button>

            <div className="spm-or"><span>OR</span></div>

            <button type="button" className="spm-crypto" onClick={goCrypto} disabled={busy || processing}>
              <span className="spm-crypto-coins">
                <span className="pm-coin" style={{ background: '#26A17B' }}>₮</span>
                <span className="pm-coin" style={{ background: '#F7931A' }}>₿</span>
                <span className="pm-coin" style={{ background: '#627EEA' }}>Ξ</span>
              </span>
              <span>Pay with Cryptocurrency — ${cryptoTotal.toFixed(2)} (incl. 2% network fee)</span>
            </button>

            <div className="spm-footer">
              <span>Powered by <strong>stripe</strong></span>
              <span className="spm-footer-sep">|</span>
              <a href="https://stripe.com/legal/consumer" target="_blank" rel="noopener noreferrer">Terms</a>
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
            </div>
          </div>
        )}

        {/* ============ STEP 2: crypto ============ */}
        {step === 'crypto' && (
          <div className="spm-body">
            {backToMethods}

            <div className="spm-crypto-hero">
              <span className="spm-crypto-coins" style={{ transform: 'scale(1.4)', marginBottom: 4 }}>
                <span className="pm-coin" style={{ background: '#26A17B' }}>₮</span>
                <span className="pm-coin" style={{ background: '#F7931A' }}>₿</span>
                <span className="pm-coin" style={{ background: '#627EEA' }}>Ξ</span>
                <span className="pm-coin" style={{ background: '#345D9D' }}>Ł</span>
              </span>
              <div className="spm-crypto-hero-t">Pay with Cryptocurrency</div>
              <div className="spm-crypto-hero-s">Bitcoin, USDT, Ethereum, Litecoin & more</div>
            </div>

            <div className="pm-plan-box" style={{ marginBottom: 16 }}>
              <p className="pm-plan-line">
                <span>{planName}</span>
                <strong>${price.toFixed(2)}</strong>
              </p>
              <div className="pm-fee-row">
                <span>Network fee (2%)</span>
                <span>${fee.toFixed(2)}</span>
              </div>
              <div className="pm-fee-row pm-fee-total">
                <span>You pay</span>
                <strong>${cryptoTotal.toFixed(2)}</strong>
              </div>
            </div>

            <p className="spm-crypto-note" style={{ marginBottom: 14 }}>
              Once your payment is confirmed, your plan will be activated automatically — no manual approval needed.
            </p>

            <button
              type="button"
              className={cn('spm-pay', busy && 'loading')}
              onClick={onCrypto}
              disabled={busy}
            >
              {busy ? <span className="gen-spinner" /> : null}
              <span>{busy ? 'Connecting…' : 'Connect'}</span>
            </button>
          </div>
        )}

        {troubleOpen && (
          <div className="spm-trouble-backdrop" onClick={() => setTroubleOpen(false)}>
            <div className="spm-trouble" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
              <div className="spm-trouble-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
              </div>
              <h4>Having trouble with your card?</h4>
              <p>If you keep facing this issue, you can choose another payment method instead — crypto payments are confirmed automatically.</p>
              <button type="button" className="spm-pay" onClick={() => { setTroubleOpen(false); goCrypto() }} disabled={busy}>
                Pay with Cryptocurrency
              </button>
              <button type="button" className="spm-trouble-again" onClick={() => setTroubleOpen(false)}>
                Try card again
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
