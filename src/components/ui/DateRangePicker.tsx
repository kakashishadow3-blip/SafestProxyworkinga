import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface DateRange {
  start: Date
  end: Date
}

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const sameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function defaultRange(): DateRange {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  return { start, end }
}

export function rangeLabel(range: DateRange): string {
  const sameYear = range.start.getFullYear() === range.end.getFullYear()
  return `${fmtShort(range.start)} – ${fmtShort(range.end)}${sameYear ? ', ' + range.end.getFullYear() : ''}`
}

/* Two-step range date picker — exact port of the dashboard calendar. */
export default function DateRangePicker({ value, onChange }: Props) {
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(value.end.getMonth())
  const [viewYear, setViewYear] = useState(value.end.getFullYear())
  const [tempStart, setTempStart] = useState<Date | null>(new Date(value.start))
  const [tempEnd, setTempEnd] = useState<Date | null>(new Date(value.end))
  const [awaitingEnd, setAwaitingEnd] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>('7')
  const [invalidFlash, setInvalidFlash] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const invalidTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) discard()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  useEffect(() => () => { if (invalidTimer.current) clearTimeout(invalidTimer.current) }, [])

  const openPicker = () => {
    setTempStart(new Date(value.start))
    setTempEnd(new Date(value.end))
    setAwaitingEnd(false)
    setViewMonth(value.end.getMonth())
    setViewYear(value.end.getFullYear())
    setActivePreset(null)
    setOpen(true)
  }

  const discard = () => {
    setTempStart(new Date(value.start))
    setTempEnd(new Date(value.end))
    setAwaitingEnd(false)
    setOpen(false)
  }

  const onDayClick = (date: Date, isFuture: boolean) => {
    if (isFuture) {
      if (invalidTimer.current) clearTimeout(invalidTimer.current)
      setInvalidFlash(true)
      invalidTimer.current = setTimeout(() => setInvalidFlash(false), 2000)
      return
    }
    if (!tempStart || !awaitingEnd) {
      setTempStart(date)
      setTempEnd(null)
      setAwaitingEnd(true)
    } else {
      if (date < tempStart) { setTempEnd(tempStart); setTempStart(date) }
      else setTempEnd(date)
      setAwaitingEnd(false)
    }
    setActivePreset(null)
  }

  const applyPreset = (preset: string) => {
    setActivePreset(preset)
    const end = new Date(today)
    let start: Date
    if (preset === '7') { start = new Date(today); start.setDate(start.getDate() - 6) }
    else if (preset === '30') { start = new Date(today); start.setDate(start.getDate() - 29) }
    else { start = new Date(today.getFullYear(), today.getMonth(), 1) }
    setTempStart(start)
    setTempEnd(end)
    setAwaitingEnd(false)
    setViewMonth(end.getMonth())
    setViewYear(end.getFullYear())
  }

  const apply = () => {
    if (!tempStart || !tempEnd || awaitingEnd) return
    onChange({ start: new Date(tempStart), end: new Date(tempEnd) })
    setOpen(false)
  }

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  // calendar cells
  const firstDay = new Date(viewYear, viewMonth, 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()
  const cells: { day: number; dim: boolean; date: Date }[] = []
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, dim: true, date: new Date(viewYear, viewMonth - 1, daysInPrevMonth - i) })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dim: false, date: new Date(viewYear, viewMonth, d) })
  let next = 1
  while (cells.length % 7 !== 0) { cells.push({ day: next, dim: true, date: new Date(viewYear, viewMonth + 1, next) }); next++ }

  const inRange = (d: Date) => !!tempStart && !!tempEnd && d > tempStart && d < tempEnd
  const inBand = (d: Date | undefined) =>
    !!d && (inRange(d) || sameDay(d, tempStart) || (sameDay(d, tempEnd) && !awaitingEnd))

  const hasStart = !!tempStart
  const hasEnd = !!tempEnd && !awaitingEnd
  const canApply = hasStart && hasEnd

  const liveLabel = !tempStart
    ? '—'
    : awaitingEnd || !tempEnd
      ? `${fmtShort(tempStart)} – …`
      : (() => {
          const sameYear = tempStart.getFullYear() === tempEnd.getFullYear()
          return `${fmtShort(tempStart)} – ${fmtShort(tempEnd)}${sameYear ? ', ' + tempEnd.getFullYear() : ''}`
        })()

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={cn('date-range-btn', open && 'open')}
        onClick={() => (open ? discard() : openPicker())}
      >
        <span>{open ? liveLabel : rangeLabel(value)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      </button>

      <div className={cn('date-picker-pop', open && 'open')}>
        <div className="dp-presets">
          {(['7', '30', 'month'] as const).map(p => (
            <button
              key={p}
              type="button"
              className={cn('dp-preset', activePreset === p && 'active')}
              onClick={() => applyPreset(p)}
            >
              {p === '7' ? 'Last 7 days' : p === '30' ? 'Last 30 days' : 'This month'}
            </button>
          ))}
        </div>
        <div className="dp-cal-head">
          <button type="button" className="dp-nav-btn" onClick={prevMonth}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="month-lbl">{MONTH_NAMES[viewMonth]} {viewYear}</div>
          <button type="button" className="dp-nav-btn" onClick={nextMonth}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
        <div className="dp-grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="dp-dow">{d}</div>)}
        </div>
        <div className="dp-grid">
          {cells.map((c, i) => {
            const isFuture = c.date > today
            const isRangeStart = sameDay(c.date, tempStart)
            const isRangeEnd = sameDay(c.date, tempEnd) && !awaitingEnd
            const col = i % 7
            const nextNeighbor = col < 6 ? cells[i + 1]?.date : cells[i + 7]?.date
            const prevNeighbor = col > 0 ? cells[i - 1]?.date : cells[i - 7]?.date
            const soloStart = isRangeStart && !inBand(nextNeighbor)
            const soloEnd = isRangeEnd && !inBand(prevNeighbor)
            return (
              <div
                key={i}
                className={cn(
                  'dp-day',
                  c.dim && 'dim',
                  isFuture && 'future',
                  sameDay(c.date, today) && 'today',
                  isRangeStart && 'range-start',
                  isRangeEnd && 'range-end',
                  inRange(c.date) && 'in-range',
                  soloStart && 'solo',
                  soloEnd && 'solo',
                )}
                onClick={e => { e.stopPropagation(); onDayClick(c.date, isFuture) }}
              >
                <div className="dp-day-bg" />
                <span className="dp-day-num">{c.day}</span>
              </div>
            )
          })}
        </div>
        <div className="dp-apply-row">
          <span className={cn('dp-hint', canApply && 'ready', invalidFlash && 'invalid')}>
            {invalidFlash
              ? "Invalid date — that day hasn't happened yet"
              : !hasStart
                ? 'Select a start date'
                : !hasEnd
                  ? 'Now select an end date'
                  : `${fmtShort(tempStart!)} – ${fmtShort(tempEnd!)}`}
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  )
}
