import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  planName: string
  price: number
  busy: boolean
  onClose: () => void
  onCrypto: () => void
}

const MC_SVG = (
  <span className="pm-mc" aria-hidden="true"><i className="pm-mc-l" /><i className="pm-mc-r" /></span>
)

export default function PaymentModal({ open, planName, price, busy, onClose, onCrypto }: Props) {
  const [method, setMethod] = useState<'card' | 'crypto'>('crypto')

  useEffect(() => {
    if (open) setMethod('crypto')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const fee = price * 0.02
  const total = price + fee

  return (
    <div className="modal-backdrop show" onClick={busy ? undefined : onClose}>
      <div className="modal-card pm-card" role="dialog" aria-modal="true" aria-label="Choose payment method" onClick={e => e.stopPropagation()}>
        <h3 className="pm-title">Choose payment method</h3>
        <div className="pm-plan-box">
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
            <strong>${total.toFixed(2)}</strong>
          </div>
        </div>

        <div className="pm-opts" role="radiogroup" aria-label="Payment method">
          <button
            type="button"
            role="radio"
            aria-checked={method === 'card'}
            className={cn('pm-opt', method === 'card' && 'on')}
            onClick={() => setMethod('card')}
            disabled={busy}
          >
            <span className="pm-radio"><span className="pm-radio-dot" /></span>
            <span className="pm-opt-main">
              <span className="pm-opt-name">Card Payment</span>
              <span className="pm-opt-sub">Powered by Stripe</span>
            </span>
            <span className="pm-badges">
              {MC_SVG}
              <span className="pm-visa">VISA</span>
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={method === 'crypto'}
            className={cn('pm-opt', method === 'crypto' && 'on')}
            onClick={() => setMethod('crypto')}
            disabled={busy}
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
              <span className="pm-coin" style={{ background: '#345D9D' }}>Ł</span>
            </span>
          </button>
        </div>

        {method === 'card' && (
          <div className="pm-soon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <span><strong>Coming soon.</strong> Card payments are not live yet — please pay with Cryptocurrency for now.</span>
          </div>
        )}

        {method === 'crypto' && (
          <div className="pm-note">
            Once your payment is confirmed, your plan will be activated automatically.
          </div>
        )}

        <div className="modal-actions pm-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          {method === 'card' ? (
            <button className="btn btn-primary pm-continue" type="button" disabled>Coming Soon</button>
          ) : (
            <button className={cn('btn btn-primary pm-continue', busy && 'loading')} type="button" onClick={onCrypto} disabled={busy}>
              <span className="gen-spinner" />
              <span>{busy ? 'Connecting…' : 'Continue'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
