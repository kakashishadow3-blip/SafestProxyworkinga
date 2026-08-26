import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hideArrow?: boolean
  emptyMsg?: string
  className?: string
}

/* Faithful React port of the dashboard's .cselect custom dropdown. */
export default function CustomSelect({ options, value, onChange, placeholder, hideArrow, emptyMsg, className }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={wrapRef} className={cn('cselect', open && 'open', hideArrow && 'cselect--no-arrow', className)}>
      <button type="button" className="cselect-btn" onClick={() => setOpen(o => !o)}>
        <span className="cselect-label">{selected ? selected.label : (placeholder ?? '—')}</span>
        {!hideArrow && (
          <svg className="cselect-chevron" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <div className="cselect-menu">
        {options.length === 0 ? (
          <div className="cselect-empty-msg">{emptyMsg ?? 'No options available'}</div>
        ) : (
          options.map(o => (
            <div
              key={o.value}
              className={cn('cselect-opt', o.value === value && 'selected')}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              <span>{o.label}</span>
              <svg className="cselect-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                <path d="M4 12l5 5L20 6" />
              </svg>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
