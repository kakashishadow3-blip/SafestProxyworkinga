import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile site key (public — safe to ship in the frontend)
export const TURNSTILE_SITE_KEY = '0x4AAAAAAEc-CheE_zYLmg8z'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

interface Props {
  onVerify: (token: string | null) => void
}

export interface TurnstileHandle {
  reset: () => void
}

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load the CAPTCHA script'))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile({ onVerify }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onVerifyRef = useRef(onVerify)
  onVerifyRef.current = onVerify

  useEffect(() => {
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onVerifyRef.current(null),
          'error-callback': () => onVerifyRef.current(null),
        })
      })
      .catch(() => onVerifyRef.current(null))

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* already removed */ }
        widgetIdRef.current = null
      }
    }
  }, [])

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.reset(widgetIdRef.current) } catch { /* noop */ }
      }
    },
  }), [])

  return <div ref={containerRef} className="turnstile-box" />
})

export default Turnstile
