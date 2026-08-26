import { useEffect, useState } from 'react'

export interface ToastItem {
  id: number
  type: 'ok' | 'err'
  title: string
  sub?: string
}

let push: ((t: ToastItem) => void) | null = null

export function showToast(type: 'ok' | 'err', title: string, sub?: string) {
  if (push) push({ id: Date.now() + Math.random(), type, title, sub })
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    push = (t) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4500)
    }
    return () => { push = null }
  }, [])

  const kill = (id: number) => setToasts(prev => prev.filter(x => x.id !== id))

  return (
    <div id="toastWrap" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={'toast ' + (t.type === 'err' ? 'err' : '')}>
          <div className="t-ic">
            {t.type === 'ok' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            )}
          </div>
          <div>
            <div className="t-title">{t.title}</div>
            {t.sub && <div className="t-sub">{t.sub}</div>}
          </div>
          <button className="t-close" type="button" aria-label="Dismiss" onClick={() => kill(t.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}
