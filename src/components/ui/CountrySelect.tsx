import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTRY_GROUPS } from '@/lib/countries'
import { cn } from '@/lib/utils'

interface Props {
  value: string // ISO code or 'MIX'
  onChange: (code: string, name: string) => void
}

const ALL_COUNTRIES = COUNTRY_GROUPS.flatMap(([, items]) => items.map(([name, code]) => ({ name, code })))

/* Country picker with search + continent groups — port of the dashboard's country-select. */
export default function CountrySelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = value === 'MIX'
    ? { code: 'MIX', name: 'Random Country' }
    : ALL_COUNTRIES.find(c => c.code === value) ?? { code: 'MIX', name: 'Random Country' }

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    if (!q) return COUNTRY_GROUPS
    return COUNTRY_GROUPS
      .map(([label, items]): [string, [string, string][]] => [label, items.filter(([name, code]) => name.toLowerCase().includes(q) || code.toLowerCase().includes(q))])
      .filter(([, items]) => items.length > 0)
  }, [q])

  const pick = (code: string, name: string) => { onChange(code, name); setOpen(false); setQuery('') }

  return (
    <div ref={wrapRef} className={cn('country-select', open && 'open')}>
      <button type="button" className="cs-btn" onClick={() => setOpen(o => !o)}>
        <span className="cs-name">{current.name}</span>
        <span className="cs-code">{current.code}</span>
        <svg className="cs-chevron" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div className="cs-menu">
        <div className="cs-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="text"
            placeholder="Search countries…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="cs-list">
          {!q && (
            <div className={cn('cs-opt', value === 'MIX' && 'selected')} onClick={() => pick('MIX', 'Random Country')}>
              <span>Random Country</span>
              <span className="cs-opt-code">MIX</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M4 12l5 5L20 6" /></svg>
            </div>
          )}
          {groups.map(([label, items]) => (
            <div key={label}>
              <div className="cs-group">{label}</div>
              {items.map(([name, code]) => (
                <div
                  key={code}
                  className={cn('cs-opt', code === value && 'selected')}
                  onClick={() => pick(code, name)}
                >
                  <span>{name}</span>
                  <span className="cs-opt-code">{code}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M4 12l5 5L20 6" /></svg>
                </div>
              ))}
            </div>
          ))}
          {groups.length === 0 && <div className="cselect-empty-msg">No countries found</div>}
        </div>
      </div>
    </div>
  )
}
