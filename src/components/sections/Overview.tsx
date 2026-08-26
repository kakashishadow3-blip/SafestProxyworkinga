import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import CustomSelect from '@/components/ui/CustomSelect'
import DateRangePicker, { DateRange, defaultRange } from '@/components/ui/DateRangePicker'
import { compactNum, dateKey } from '@/lib/utils'
import { tierLabel } from '@/lib/plans'
import type { Subscription, UsageStat } from '@/types'

Chart.register(...registerables)

interface UsageRow {
  date: string
  label: string
  labelLong: string
  traffic: number
  extraTraffic: number
  requests: number
}

interface Props {
  userId?: string // admin viewing another user's dashboard
}

export default function Overview({ userId }: Props) {
  const { user } = useAuth()
  const uid = userId ?? user?.id
  const readOnly = !!userId
  const navigate = useNavigate()

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [allSubs, setAllSubs] = useState<Subscription[]>([])
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [statsType, setStatsType] = useState('traffic')
  const [planFilter, setPlanFilter] = useState('__all__')
  const [loading, setLoading] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!uid) return
    ;(async () => {
      const [{ data: active }, { data: subs }] = await Promise.all([
        supabase.from('subscriptions').select('*, plans(*)').eq('user_id', uid).eq('status', 'active')
          .order('expiry_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('subscriptions').select('*, plans(*)').eq('user_id', uid).order('created_at', { ascending: false }),
      ])
      setSubscription((active as Subscription | null) ?? null)
      setAllSubs((subs as Subscription[] | null) ?? [])
    })()
  }, [uid])

  const planOptions = useMemo(() => {
    const opts = allSubs.map(s => ({ value: s.id, label: s.plans?.name ?? 'Plan' }))
    return opts.length > 1 ? [{ value: '__all__', label: 'All Plans' }, ...opts] : opts
  }, [allSubs])

  useEffect(() => {
    if (planOptions.length && !planOptions.some(o => o.value === planFilter)) {
      setPlanFilter(planOptions[0].value)
    }
  }, [planOptions, planFilter])

  const buildRows = useCallback((stats: UsageStat[]): UsageRow[] => {
    const rows: UsageRow[] = []
    const d = new Date(range.start)
    while (d <= range.end) {
      const key = dateKey(d)
      const recs = stats.filter(s => s.date === key && (planFilter === '__all__' || s.subscription_id === planFilter))
      if (recs.length) {
        rows.push({
          date: key,
          label: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
          labelLong: d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
          traffic: recs.reduce((a, r) => a + Number(r.traffic_gb), 0),
          extraTraffic: recs.reduce((a, r) => a + Number(r.extra_traffic_gb), 0),
          requests: recs.reduce((a, r) => a + r.requests, 0),
        })
      }
      d.setDate(d.getDate() + 1)
    }
    return rows
  }, [range, planFilter])

  const [rows, setRows] = useState<UsageRow[]>([])

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('usage_stats')
        .select('*')
        .eq('user_id', uid)
        .gte('date', dateKey(range.start))
        .lte('date', dateKey(range.end))
      if (cancelled) return
      setRows(buildRows((data as UsageStat[] | null) ?? []))
      setLoading(false)
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [uid, range, planFilter, buildRows])

  const isTraffic = statsType === 'traffic'
  const planLabel = planOptions.find(o => o.value === planFilter)?.label ?? '—'
  const totalTraffic = rows.reduce((a, r) => a + r.traffic, 0)
  const totalExtra = rows.reduce((a, r) => a + r.extraTraffic, 0)
  const totalReq = rows.reduce((a, r) => a + r.requests, 0)
  const hasData = rows.length > 0 && !rows.every(r => !r.traffic && !r.requests)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    if (!hasData) return

    const inkColor = '#14161D'
    const n = rows.length
    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: rows.map(r => r.label),
        datasets: [{
          label: planLabel,
          data: rows.map(r => (isTraffic ? r.traffic : r.requests)),
          fill: true, tension: 0.3, borderColor: inkColor, borderWidth: 2,
          pointRadius: 0, pointHitRadius: 16,
          pointHoverRadius: 4.5, pointHoverBackgroundColor: '#fff', pointHoverBorderColor: inkColor, pointHoverBorderWidth: 2,
          backgroundColor: (c) => {
            const g = c.chart.ctx.createLinearGradient(0, 0, 0, c.chart.height || 300)
            g.addColorStop(0, 'rgba(20,22,29,0.09)')
            g.addColorStop(1, 'rgba(20,22,29,0)')
            return g
          },
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#14161D', borderWidth: 0, cornerRadius: 10,
            padding: { top: 10, bottom: 10, left: 14, right: 14 }, displayColors: false, caretSize: 5,
            titleColor: 'rgba(255,255,255,.5)', titleFont: { family: 'Inter', weight: 600, size: 9.5 },
            titleMarginBottom: 6,
            bodyColor: '#FFFFFF', bodyFont: { family: 'Inter', weight: 600, size: 17 },
            footerColor: 'rgba(255,255,255,.45)', footerFont: { family: 'Inter', size: 10.5, weight: 500 },
            footerMarginTop: 4,
            callbacks: {
              title: (items) => rows[items[0].dataIndex].labelLong.toUpperCase(),
              label: (ctx) => isTraffic ? ctx.parsed.y!.toFixed(2) + ' GB' : ctx.parsed.y!.toLocaleString() + ' req',
              footer: () => planLabel,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false }, border: { display: false },
            ticks: {
              color: 'rgba(154,161,174,0.9)', font: { family: 'Inter', size: 10.5, weight: 500 },
              autoSkip: true, maxRotation: 0, minRotation: 0,
              maxTicksLimit: n <= 8 ? n : n <= 14 ? 7 : 8,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(20,22,29,0.045)', drawTicks: false }, border: { display: false },
            ticks: {
              color: 'rgba(154,161,174,0.9)', font: { family: 'Inter', size: 10.5, weight: 500 },
              padding: 10, maxTicksLimit: 5,
              callback: (v) => isTraffic ? v + ' GB' : compactNum(Number(v)),
            },
          },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [rows, isTraffic, hasData, planLabel])

  const active = subscription && subscription.status === 'active'
  const limit = subscription?.bandwidth_limit_gb ?? 0
  const used = subscription?.bandwidth_used_gb ?? 0
  const left = Math.max(0, limit - used)
  const pct = active && limit > 0 ? Math.min(100, (used / limit) * 100) : 0

  const rangeDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1

  return (
    <section className="section active">
      <div className="metric-row">
        <div className="metric-card">
          <div className="metric-eyebrow">Current Plan</div>
          <div className="metric-label">{active ? (subscription?.plans?.name ?? 'Active') : 'Non-Active'}</div>
          <div className="metric-value" style={{ marginBottom: 12 }}>
            {active && limit > 0 ? (
              <>{used.toFixed(1)} GB <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-dim)' }}>of {tierLabel(limit)} used</span></>
            ) : '—'}
          </div>
          <div className="metric-progress"><div className="metric-progress-fill" style={{ width: `${pct}%` }} /></div>
          {!readOnly && <button className="btn btn-primary btn-sm" type="button" onClick={() => navigate('/plans')}>Upgrade Plan</button>}
        </div>
        <div className="metric-card violet">
          <div className="metric-eyebrow">Traffic Left</div>
          <div className="metric-label">Remaining Balance</div>
          <div className="metric-value" style={{ marginBottom: 12 }}>{active ? `${left.toFixed(2)} GB` : '0.00 GB'}</div>
          <div className="metric-detail">
            {active ? `${used.toFixed(1)} GB of ${tierLabel(limit)} used · ${subscription?.plans?.name ?? ''}` : 'No active plan — choose a plan to get started'}
          </div>
          {!readOnly && <button className="btn btn-primary btn-sm" type="button" onClick={() => navigate('/billing')}>Add GBs</button>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Daily Activity</h3>
            <p>Last {rangeDays} day{rangeDays === 1 ? '' : 's'} (UTC)</p>
          </div>
        </div>

        <div className="usage-controls">
          <div className="form-row" style={{ marginBottom: 0, position: 'relative' }}>
            <label>Select Dates</label>
            <DateRangePicker value={range} onChange={setRange} />
          </div>

          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Stats Type</label>
            <CustomSelect
              options={[{ value: 'traffic', label: 'Traffic Stats' }, { value: 'request', label: 'Request Stats' }]}
              value={statsType}
              onChange={setStatsType}
            />
          </div>

          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Select Plan</label>
            <CustomSelect
              options={planOptions}
              value={planFilter}
              onChange={setPlanFilter}
              hideArrow={planOptions.length <= 1}
              emptyMsg="You don't have any other plans."
            />
          </div>
        </div>

        <div className="usage-chart-head">
          <div className="usage-chart-title">{isTraffic ? 'Stats by Traffic' : 'Stats by Requests'}</div>
          <div className="usage-chart-plan">{planLabel}</div>
        </div>
        <div className={`usage-chart-wrap${loading ? ' loading' : ''}`}>
          <canvas ref={canvasRef} style={{ display: hasData ? 'block' : 'none' }} />
          <div className="usage-skeleton">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="sk-bar" style={{ height: `${28 + ((i * 37) % 62)}%`, animationDelay: `${i * 0.07}s` }} />
            ))}
          </div>
          <div className={`usage-empty${!loading && !hasData ? ' show' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg>
            <span>No recent traffic.</span>
          </div>
        </div>

        <div className="usage-footer-stats">
          <div><span className="l">Total Traffic</span><span className="v">{rows.length ? totalTraffic.toFixed(2) + ' GB' : '—'}</span></div>
          <div><span className="l">Total Extra Traffic</span><span className="v">{rows.length ? totalExtra.toFixed(2) + ' GB' : '—'}</span></div>
          <div><span className="l">Total Requests</span><span className="v">{rows.length ? totalReq.toLocaleString() : '—'}</span></div>
        </div>
      </div>
    </section>
  )
}
