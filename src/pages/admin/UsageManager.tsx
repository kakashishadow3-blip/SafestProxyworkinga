import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { showToast } from '@/lib/toast'
import type { Subscription, UsageStat } from '@/types'

interface Props {
  adminId: string
  userId: string
}

export default function UsageManager({ adminId, userId }: Props) {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [rows, setRows] = useState<UsageStat[]>([])
  const [loading, setLoading] = useState(true)

  const [fSubId, setFSubId] = useState('')
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [fTraffic, setFTraffic] = useState('')
  const [fExtra, setFExtra] = useState('')
  const [fRequests, setFRequests] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: u }] = await Promise.all([
      supabase.from('subscriptions').select('*, plans(*)').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('usage_stats').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(90),
    ])
    const subList = (s as Subscription[] | null) ?? []
    setSubs(subList)
    setRows((u as UsageStat[] | null) ?? [])
    setFSubId(prev =>
      prev && subList.some(x => x.id === prev)
        ? prev
        : (subList.find(x => x.status === 'active') ?? subList[0])?.id ?? '',
    )
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const subName = (id: string | null) => subs.find(s => s.id === id)?.plans?.name ?? '—'

  const save = async () => {
    if (!fDate) { showToast('err', 'Pick a date first'); return }
    if (!fSubId) {
      showToast('err', 'No plan assigned', 'Usage is tracked per plan — assign this user a plan first (Manage User → Subscription).')
      return
    }
    const traffic = Math.round((Number(fTraffic) || 0) * 1000) / 1000
    const extra = Math.round((Number(fExtra) || 0) * 1000) / 1000
    const reqs = Math.round(Number(fRequests) || 0)
    if (traffic < 0 || extra < 0 || reqs < 0) { showToast('err', 'Values cannot be negative'); return }
    if (!traffic && !extra && !reqs) { showToast('err', 'Enter at least one value', 'Traffic, extra traffic or requests.'); return }

    setSaving(true)
    const existing = rows.find(r => r.date === fDate && r.subscription_id === fSubId)
    const payload = {
      user_id: userId,
      subscription_id: fSubId,
      date: fDate,
      traffic_gb: traffic,
      extra_traffic_gb: extra,
      requests: reqs,
    }
    const { error } = await supabase
      .from('usage_stats')
      .upsert(payload, { onConflict: 'user_id,subscription_id,date' })
    if (error) {
      showToast('err', 'Could not save usage', error.message)
    } else {
      await logAudit(adminId, userId, existing ? 'update_usage' : 'add_usage', 'usage_stat', fSubId,
        existing ? `${fDate} · ${existing.traffic_gb} GB · ${existing.requests} req` : null,
        `${fDate} · ${traffic} GB · extra ${extra} GB · ${reqs} req · ${subName(fSubId)}`)
      showToast('ok', existing ? 'Usage updated' : 'Usage added',
        `${subName(fSubId)} · ${new Date(fDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — ${traffic} GB`)
      setFTraffic('')
      setFExtra('')
      setFRequests('')
      await load()
    }
    setSaving(false)
  }

  const remove = async (row: UsageStat) => {
    setDeleting(row.id)
    const { error } = await supabase.from('usage_stats').delete().eq('id', row.id)
    if (error) {
      showToast('err', 'Could not delete entry', error.message)
    } else {
      await logAudit(adminId, userId, 'delete_usage', 'usage_stat', row.id,
        `${row.date} · ${row.traffic_gb} GB · ${row.requests} req · ${subName(row.subscription_id)}`, null)
      showToast('ok', 'Usage entry deleted', row.date)
      await load()
    }
    setDeleting(null)
  }

  const fillForEdit = (row: UsageStat) => {
    setFSubId(row.subscription_id ?? '')
    setFDate(row.date)
    setFTraffic(String(row.traffic_gb ?? ''))
    setFExtra(String(row.extra_traffic_gb ?? ''))
    setFRequests(String(row.requests ?? ''))
    showToast('ok', 'Entry loaded into the form', 'Edit the values and save to update this date.')
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Daily Usage</h3>
          <p>Add or edit day-wise traffic for this user. Entries appear in the Overview usage chart in date order. Saving the same date again overwrites it.</p>
        </div>
      </div>

      {subs.length === 0 && !loading ? (
        <div className="warn-banner" style={{ marginBottom: 18 }}>
          This user has no plan yet. Assign a plan first (Manage User → Subscription), then you can log daily usage against it.
        </div>
      ) : null}

      <div className="field-grid">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Plan / Subscription</label>
          <select className="plain-select" value={fSubId} onChange={e => setFSubId(e.target.value)} disabled={!subs.length}>
            {!subs.length && <option value="">— No plans —</option>}
            {subs.map(s => (
              <option key={s.id} value={s.id}>
                {s.plans?.name ?? 'Plan'} · {s.status}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input type="date" value={fDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setFDate(e.target.value)} />
        </div>
      </div>

      <div className="field-grid" style={{ marginTop: 18, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Traffic (GB)</label>
          <input type="number" min="0" step="0.01" value={fTraffic} onChange={e => setFTraffic(e.target.value)} placeholder="e.g. 2.45" />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Extra traffic (GB)</label>
          <input type="number" min="0" step="0.01" value={fExtra} onChange={e => setFExtra(e.target.value)} placeholder="optional" />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Requests</label>
          <input type="number" min="0" step="1" value={fRequests} onChange={e => setFRequests(e.target.value)} placeholder="optional" />
        </div>
      </div>

      <div className="manage-save-row">
        <button className="btn btn-primary" disabled={saving || !subs.length} onClick={save}>
          {saving ? 'Saving…' : 'Save usage'}
        </button>
        <span className="manage-hint">Same plan + same date = overwrite. The Overview chart updates instantly for the user.</span>
      </div>

      <div style={{ marginTop: 26 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Logged entries</h4>
        {loading ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No usage logged yet for this user.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th>Traffic</th>
                <th>Extra</th>
                <th>Requests</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>{subName(r.subscription_id)}</td>
                  <td>{Number(r.traffic_gb).toFixed(2)} GB</td>
                  <td>{Number(r.extra_traffic_gb).toFixed(2)} GB</td>
                  <td>{Number(r.requests).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => fillForEdit(r)}>Edit</button>{' '}
                    <button className="btn btn-danger btn-sm" disabled={deleting === r.id} onClick={() => remove(r)}>
                      {deleting === r.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
