import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import { showToast } from '@/lib/toast'
import { cn, fmtDate } from '@/lib/utils'
import { productOf, PRODUCT_META, PRODUCT_ORDER, tierLong } from '@/lib/plans'
import type { Plan } from '@/types'

interface FormState {
  id: string | null
  name: string
  price: string
  bandwidth_gb: string
  duration_days: string
}

const EMPTY: FormState = { id: null, name: '', price: '', bandwidth_gb: '', duration_days: '30' }

export default function PlanManager() {
  const { user } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('plans').select('*').order('price', { ascending: true })
    setPlans((data as Plan[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: keyof FormState, v: string) => setForm(f => (f ? { ...f, [k]: v } : f))

  const save = async () => {
    if (!form || !user || saving) return
    const name = form.name.trim()
    const price = Number(form.price)
    const gb = Number(form.bandwidth_gb)
    const days = Number(form.duration_days)
    if (!name) { showToast('err', 'Name is required'); return }
    if (!Number.isFinite(price) || price <= 0) { showToast('err', 'Price must be greater than 0'); return }
    if (!Number.isFinite(gb) || gb < 0) { showToast('err', 'Traffic (GB) must be 0 or more'); return }
    if (!Number.isInteger(days) || days <= 0) { showToast('err', 'Duration must be a whole number of days'); return }
    setSaving(true)
    const payload = { name, price, bandwidth_gb: gb, duration_days: days }
    if (form.id) {
      const prev = plans.find(p => p.id === form.id)
      const { error } = await supabase.from('plans').update(payload).eq('id', form.id)
      if (error) showToast('err', 'Could not update plan', error.message)
      else {
        await logAudit(user.id, user.id, 'update_plan', 'plan', form.id,
          prev ? `${prev.name} · $${Number(prev.price)} · ${prev.bandwidth_gb} GB · ${prev.duration_days}d` : '—',
          `${name} · $${price} · ${gb} GB · ${days}d`)
        showToast('ok', 'Plan updated', name)
        setForm(null)
        await load()
      }
    } else {
      const { data, error } = await supabase.from('plans').insert(payload).select().single()
      if (error) showToast('err', 'Could not create plan', error.message)
      else {
        await logAudit(user.id, user.id, 'create_plan', 'plan', data?.id ?? '', '—', `${name} · $${price} · ${gb} GB · ${days}d`)
        showToast('ok', 'Plan created', name)
        setForm(null)
        await load()
      }
    }
    setSaving(false)
  }

  const toggleActive = async (plan: Plan) => {
    if (!user || busyId) return
    setBusyId(plan.id)
    const next = plan.is_active === false
    const { error } = await supabase.from('plans').update({ is_active: next }).eq('id', plan.id)
    if (error) showToast('err', 'Could not update plan', error.message)
    else {
      await logAudit(user.id, user.id, next ? 'enable_plan' : 'disable_plan', 'plan', plan.id, plan.name, plan.name)
      showToast('ok', next ? 'Plan enabled' : 'Plan hidden', plan.name)
      await load()
    }
    setBusyId(null)
  }

  const remove = async (plan: Plan) => {
    if (!user || busyId) return
    if (!window.confirm(`Delete plan "${plan.name}"? Existing orders and subscriptions keep working, but it will no longer be sold.`)) return
    setBusyId(plan.id)
    const { error } = await supabase.from('plans').delete().eq('id', plan.id)
    if (error) showToast('err', 'Could not delete plan', error.message)
    else {
      await logAudit(user.id, user.id, 'delete_plan', 'plan', plan.id, plan.name, '—')
      showToast('ok', 'Plan deleted', plan.name)
      await load()
    }
    setBusyId(null)
  }

  /* Group plans by product category for easier management */
  const groups = PRODUCT_ORDER
    .map(k => ({ key: k, list: plans.filter(p => productOf(p.name) === k) }))
    .filter(g => g.list.length > 0)

  const renderRow = (p: Plan) => {
    const hidden = p.is_active === false
    return (
      <tr key={p.id} style={hidden ? { opacity: 0.55 } : undefined}>
        <td style={{ fontWeight: 600, color: 'var(--text-hi)' }}>{p.name}</td>
        <td className="mono" style={{ fontWeight: 700, color: 'var(--text-hi)' }}>${Number(p.price).toFixed(2)}</td>
        <td>{p.bandwidth_gb > 0 ? tierLong(p.bandwidth_gb) : 'Unlimited'}</td>
        <td>{p.duration_days} days</td>
        <td>
          <button
            className={cn('tag dot', hidden ? 'warn' : 'ok')}
            type="button"
            style={{ border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}
            disabled={busyId === p.id}
            onClick={() => toggleActive(p)}
            title={hidden ? 'Hidden from users — click to enable' : 'Visible to users — click to hide'}
          >
            {hidden ? 'Hidden' : 'Live'}
          </button>
        </td>
        <td className="mono" style={{ fontSize: 12 }}>{p.created_at ? fmtDate(new Date(p.created_at)) : '—'}</td>
        <td style={{ textAlign: 'right' }}>
          <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" type="button" disabled={busyId === p.id}
              onClick={() => setForm({ id: p.id, name: p.name, price: String(Number(p.price)), bandwidth_gb: String(p.bandwidth_gb), duration_days: String(p.duration_days) })}>
              Edit
            </button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busyId === p.id} onClick={() => remove(p)}>Delete</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Plans & Pricing</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
            Price changes apply to new payments instantly — existing subscriptions are not affected.
          </p>
        </div>
        {!form && (
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setForm(EMPTY)}>+ Add plan</button>
        )}
      </div>

      {form && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-head">
            <div><h3>{form.id ? 'Edit plan' : 'New plan'}</h3>
              <p>Start the name with Residential / Mobile / Static / Datacenter / Unlimited so it shows under the right product tab (e.g. "Residential 135GB").</p>
            </div>
          </div>
          <div className="field-grid">
            <div className="form-row">
              <label>Plan name</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Residential 135GB" />
            </div>
            <div className="form-row">
              <label>Price (USD)</label>
              <input type="number" min="1" step="0.01" value={form.price} onChange={e => set('price', e.target.value)} placeholder="39" />
            </div>
            <div className="form-row">
              <label>Traffic (GB) — 0 = unlimited</label>
              <input type="number" min="0" step="1" value={form.bandwidth_gb} onChange={e => set('bandwidth_gb', e.target.value)} placeholder="135" />
            </div>
            <div className="form-row">
              <label>Duration (days)</label>
              <input type="number" min="1" step="1" value={form.duration_days} onChange={e => set('duration_days', e.target.value)} placeholder="30" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-primary btn-sm" type="button" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create plan'}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={saving} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div className="empty">Loading plans…</div> : plans.length === 0 ? <div className="empty">No plans yet.</div> : (
        groups.map(g => (
          <div className="plm-group" key={g.key}>
            <div className="plm-group-head">
              <h3>{PRODUCT_META[g.key].name}</h3>
              <span className="plm-group-count">{g.list.length} plan{g.list.length === 1 ? '' : 's'}</span>
            </div>
            <table className="admin-table">
              <thead>
                <tr><th>Plan</th><th>Price</th><th>Traffic</th><th>Duration</th><th>Status</th><th>Created</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {g.list.map(renderRow)}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
