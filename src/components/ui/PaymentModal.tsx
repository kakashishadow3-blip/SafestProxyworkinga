import { useEffect, useState } from 'react'
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

/* ---- input formatters (formatting only — nothing ever leaves the browser) ---- */
const fmtCardNumber = (v: string) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')

const fmtExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)} / ${d.slice(2)}`
}

const fmtCvc = (v: string) => v.replace(/\D/g, '').slice(0, 4)

export default function PaymentModal({ open, planName, price, busy, onClose, onCrypto }: Props) {
  const { user } = useAuth()
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
  const [formErr, setFormErr] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [troubleOpen, setTroubleOpen] = useState(false)

  /* reset everything each time the modal opens */
  useEffect(() => {
    if (open) {
      setCurrency('PKR')
      setCardNumber(''); setExpiry(''); setCvc(''); setHolderName('')
      setCountry('Pakistan'); setAddress1(''); setAddress2(''); setSuburb(''); setCity(''); setPostal('')
      setProcessing(false); setDeclined(false); setFormErr(''); setAttempts(0); setTroubleOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !processing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, processing, onClose])

  if (!open) return null

  const pkr = Math.round(price * PKR_RATE)
  const fee = price * 0.02
  const cryptoTotal = price + fee

  const expiryValid = (() => {
    const m = expiry.replace(/\D/g, '')
    if (m.length !== 4) return false
    const mm = Number(m.slice(0, 2))
    return mm >= 1 && mm <= 12
  })()

  /* Attempt metadata ONLY — card number / CVC / name / address are NEVER sent anywhere. */
  const logAttempt = (cur: 'PKR' | 'USD', ctry: string) => {
    if (!user) return
    supabase.from('card_payment_attempts').insert({
      user_id: user.id,
      plan_name: planName,
      amount_usd: price,
      currency: cur,
      country: ctry,
    }).then(() => { /* fire and forget */ })
  }

  const handlePay = () => {
    if (processing || busy) return
    setFormErr('')
    setDeclined(false)
    if (cardNumber.replace(/\D/g, '').length < 15 || !expiryValid || cvc.length < 3) {
      setFormErr('Please enter complete and valid card details.')
      return
    }
    if (!holderName.trim() || !address1.trim() || !city.trim() || !postal.trim()) {
      setFormErr('Please complete the cardholder name and billing address.')
      return
    }
    setProcessing(true)
    const cur = currency
    const ctry = country
    setTimeout(() => {
      setProcessing(false)
      setDeclined(true)
      setCvc('')
      logAttempt(cur, ctry)
      const n = attempts + 1
      setAttempts(n)
      if (n >= 3) setTroubleOpen(true)
    }, 1400)
  }

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

        <div className="spm-body">
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
            Card
          </div>

          {declined && (
            <div className="spm-decline" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              <span>Your card was declined. Please try a different card, or choose another payment method below.</span>
            </div>
          )}
          {formErr && !declined && (
            <div className="spm-decline" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              <span>{formErr}</span>
            </div>
          )}

          <div className="spm-group">
            <label className="spm-flbl">Card information</label>
            <div className="spm-fieldset">
              <div className="spm-frow spm-cardno">
                <input
                  type="text" inputMode="numeric" autoComplete="cc-number"
                  placeholder="1234 1234 1234 1234"
                  value={cardNumber}
                  onChange={e => setCardNumber(fmtCardNumber(e.target.value))}
                />
                <span className="spm-brands">
                  <span className="pm-visa">VISA</span>
                  <span className="pm-mc" aria-hidden="true"><i className="pm-mc-l" /><i className="pm-mc-r" /></span>
                </span>
              </div>
              <div className="spm-frow spm-split">
                <input
                  type="text" inputMode="numeric" autoComplete="cc-exp"
                  placeholder="MM / YY"
                  value={expiry}
                  onChange={e => setExpiry(fmtExpiry(e.target.value))}
                />
                <input
                  type="text" inputMode="numeric" autoComplete="cc-csc"
                  placeholder="CVC"
                  value={cvc}
                  onChange={e => setCvc(fmtCvc(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="spm-group">
            <label className="spm-flbl">Cardholder name</label>
            <div className="spm-fieldset">
              <div className="spm-frow">
                <input
                  type="text" autoComplete="cc-name"
                  placeholder="Full name on card"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
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
              <div className="spm-frow">
                <input type="text" placeholder="Address line 1" value={address1} onChange={e => setAddress1(e.target.value)} autoComplete="address-line1" />
              </div>
              <div className="spm-frow">
                <input type="text" placeholder="Address line 2" value={address2} onChange={e => setAddress2(e.target.value)} autoComplete="address-line2" />
              </div>
              <div className="spm-frow">
                <input type="text" placeholder="Suburb" value={suburb} onChange={e => setSuburb(e.target.value)} autoComplete="address-level3" />
              </div>
              <div className="spm-frow spm-split">
                <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)} autoComplete="address-level2" />
                <input type="text" placeholder="Postal code" value={postal} onChange={e => setPostal(e.target.value)} autoComplete="postal-code" />
              </div>
            </div>
          </div>

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

          <button type="button" className="spm-crypto" onClick={onCrypto} disabled={busy || processing}>
            <span className="spm-crypto-coins">
              <span className="pm-coin" style={{ background: '#26A17B' }}>₮</span>
              <span className="pm-coin" style={{ background: '#F7931A' }}>₿</span>
              <span className="pm-coin" style={{ background: '#627EEA' }}>Ξ</span>
            </span>
            <span>Pay with Cryptocurrency — ${cryptoTotal.toFixed(2)} (incl. 2% network fee)</span>
          </button>
          <p className="spm-crypto-note">Crypto payments are confirmed automatically and your plan activates right away.</p>

          <div className="spm-footer">
            <span>Powered by <strong>stripe</strong></span>
            <span className="spm-footer-sep">|</span>
            <a href="https://stripe.com/legal/consumer" target="_blank" rel="noopener noreferrer">Terms</a>
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
          </div>
        </div>

        {troubleOpen && (
          <div className="spm-trouble-backdrop" onClick={() => setTroubleOpen(false)}>
            <div className="spm-trouble" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
              <div className="spm-trouble-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
              </div>
              <h4>Having trouble with your card?</h4>
              <p>If you keep facing this issue, you can choose another payment method instead — crypto payments are confirmed automatically.</p>
              <button type="button" className="spm-pay" onClick={() => { setTroubleOpen(false); onCrypto() }} disabled={busy}>
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
