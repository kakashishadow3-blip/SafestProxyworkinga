import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTRY_GROUPS } from '@/lib/countries'
import { cn } from '@/lib/utils'

interface Props {
  value: string[] // selected ISO codes, [] = Random Country (MIX)
  onChange: (codes: string[], names: string[]) => void
}

const ALL_COUNTRIES = COUNTRY_GROUPS.flatMap(([, items]) => items.map(([name, code]) => ({ name, code })))

/* Multi-country picker — search, continent groups, removable chips.
   [] selection means Random Country (MIX). */
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

  const selected = useMemo(
    () => value.map(code => ALL_COUNTRIES.find(c => c.code === code)).filter((c): c is { name: string; code: string } => !!c),
    [value],
  )

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    if (!q) return COUNTRY_GROUPS
    return COUNTRY_GROUPS
      .map(([label, items]): [string, [string, string][]] => [label, items.filter(([name, code]) => name.toLowerCase().includes(q) || code.toLowerCase().includes(q))])
      .filter(([, items]) => items.length > 0)
  }, [q])

  const emit = (codes: string[]) => {
    const names = codes.map(code => ALL_COUNTRIES.find(c => c.code === code)?.name ?? code)
    onChange(codes, names)
  }

  const toggle = (code: string) => {
    emit(value.includes(code) ? value.filter(c => c !== code) : [...value, code])
  }

  const pickRandom = () => { emit([]); setOpen(false); setQuery('') }
  const removeOne = (code: string) => emit(value.filter(c => c !== code))

  return (
    <div ref={wrapRef} className={cn('country-select', 'multi', open && 'open')}>
      <button type="button" className="cs-btn" onClick={() => setOpen(o => !o)}>
        <span className="cs-name">
          {selected.length === 0
            ? 'Random Country'
            : selected.length === 1
              ? selected[0].name
              : `${selected.length} countries selected`}
        </span>
        <span className="cs-code">{selected.length === 0 ? 'MIX' : `${selected.length}`}</span>
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
        {value.length > 0 && (
          <div className="cs-toolbar">
            <span>{value.length} selected</span>
            <button type="button" onClick={() => emit([])}>Clear all</button>
          </div>
        )}
        <div className="cs-list">
          {!q && (
            <div className={cn('cs-opt', value.length === 0 && 'selected')} onClick={pickRandom}>
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
                  className={cn('cs-opt', value.includes(code) && 'selected')}
                  onClick={() => toggle(code)}
                >
                  <span className="cs-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12l5 5L20 6" /></svg>
                  </span>
                  <span>{name}</span>
                  <span className="cs-opt-code">{code}</span>
                </div>
              ))}
            </div>
          ))}
          {groups.length === 0 && <div className="cselect-empty-msg">No countries found</div>}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="cs-chips">
          {selected.map(c => (
            <span key={c.code} className="cs-chip">
              {c.name}
              <button
                type="button"
                aria-label={`Remove ${c.name}`}
                onClick={() => removeOne(c.code)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
