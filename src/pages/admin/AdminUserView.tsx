import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logAudit } from '@/lib/audit'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import Overview from '@/components/sections/Overview'
import ProxyAccess from '@/components/sections/ProxyAccess'
import ApiManagement from '@/components/sections/ApiManagement'
import Plans from '@/components/sections/Plans'
import Billing from '@/components/sections/Billing'
import ProfileSection from '@/components/sections/ProfileSection'
import UsageManager from '@/pages/admin/UsageManager'
import type { Plan, Profile, ProxyCredential, Subscription } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

type SectionKey = 'overview' | 'usage' | 'proxy' | 'api' | 'plans' | 'billing' | 'profile' | 'manage'

const SECTION_TABS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'usage', label: 'Usage Stats' },
  { key: 'proxy', label: 'Proxy Access' },
  { key: 'api', label: 'API Management' },
  { key: 'plans', label: 'Available Plans' },
  { key: 'billing', label: 'Billing' },
  { key: 'profile', label: 'Profile' },
  { key: 'manage', label: 'Manage User' },
]

export default function AdminUserView() {
  const { userId } = useParams<{ userId: string }>()
  const { user: admin } = useAuth()
  const [section, setSection] = useState<SectionKey>('overview')

  const [target, setTarget] = useState<Profile | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [allSubs, setAllSubs] = useState<Subscription[]>([])
  const [creds, setCreds] = useState<ProxyCredential | null>(null)
  const [loading, setLoading] = useState(true)

  // manage form state
  const [fUsername, setFUsername] = useState('')
  const [fIsAdmin, setFIsAdmin] = useState(false)
  const [fSubId, setFSubId] = useState('')          // '' = create a brand-new subscription
  const [fPlanId, setFPlanId] = useState('')
  const [fSubStatus, setFSubStatus] = useState<string>('active')
  const [fUsed, setFUsed] = useState('0')
  const [fLimit, setFLimit] = useState('0')
  const [fExpiry, setFExpiry] = useState('')
  const [fCredUser, setFCredUser] = useState('')
  const [fCredPass, setFCredPass] = useState('')
  const [fCredHost, setFCredHost] = useState('gate.safestproxy.com')
  const [fCredPort, setFCredPort] = useState('7777')
  const [fCredStatus, setFCredStatus] = useState<string>('active')
  const [saving, setSaving] = useState<string | null>(null)

  /* Fill the subscription form from a subscription row */
  const fillSubForm = (sel: Subscription | null) => {
    setFPlanId(sel?.plan_id ?? '')
    setFSubStatus(sel?.status ?? 'active')
    setFUsed(String(sel?.bandwidth_used_gb ?? 0))
    setFLimit(String(sel?.bandwidth_limit_gb ?? 0))
    setFExpiry(sel?.expiry_date ? sel.expiry_date.slice(0, 10) : '')
  }

  /* Admin picks which of the user's subscriptions to edit ('' = create new) */
  const selectSub = (id: string) => {
    setFSubId(id)
    fillSubForm(id ? allSubs.find(x => x.id === id) ?? null : null)
  }

  const load = useCallback(async (keepSubId?: string) => {
    if (!userId) return
    setLoading(true)
    const [{ data: p }, { data: pl }, { data: s }, { data: c }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('plans').select('*').order('price', { ascending: true }),
      supabase.from('subscriptions').select('*, plans(*)').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('proxy_credentials').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const prof = (p as Profile | null) ?? null
    const subs = (s as Subscription[] | null) ?? []
    const cred = (c as ProxyCredential | null) ?? null
    setTarget(prof)
    setPlans((pl as Plan[] | null) ?? [])
    setAllSubs(subs)
    setCreds(cred)

    setFUsername(prof?.username ?? '')
    setFIsAdmin(!!prof?.is_admin)
    /* keep editing the same subscription across reloads if it still exists */
    const sel = subs.find(x => x.id === keepSubId) ?? subs[0] ?? null
    setFSubId(sel?.id ?? '')
    fillSubForm(sel)
    setFCredUser(cred?.dataimpulse_username ?? '')
    setFCredPass(cred?.dataimpulse_password ?? '')
    setFCredHost(cred?.host ?? 'gate.safestproxy.com')
    setFCredPort(String(cred?.port ?? 7777))
    setFCredStatus(cred?.status ?? 'active')
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const saveProfile = async () => {
    if (!admin || !userId || !target) return
    setSaving('profile')
    const { error } = await supabase.from('profiles').update({ username: fUsername.trim() || null, is_admin: fIsAdmin }).eq('id', userId)
    if (error) showToast('err', 'Could not update profile', error.message)
    else {
      await logAudit(admin.id, userId, 'update_profile', 'profile', userId,
        `username: ${target.username ?? '—'} · is_admin: ${target.is_admin}`,
        `username: ${fUsername.trim() || '—'} · is_admin: ${fIsAdmin}`)
      showToast('ok', 'Profile updated')
      await load()
    }
    setSaving(null)
  }

  const saveSubscription = async () => {
    if (!admin || !userId) return
    setSaving('subscription')
    const plan = plans.find(p => p.id === fPlanId) ?? null
    const editing = allSubs.find(x => x.id === fSubId) ?? null
    const payload = {
      plan_id: fPlanId || null,
      status: fSubStatus,
      bandwidth_used_gb: Number(fUsed) || 0,
      bandwidth_limit_gb: Number(fLimit) || 0,
      expiry_date: fExpiry ? new Date(fExpiry + 'T23:59:59Z').toISOString() : null,
    }

    let error = null as { message: string } | null
    let savedId = editing?.id ?? ''

    if (editing) {
      /* Edit the selected row in place — other plans run independently (multi-plan model) */
      const res = await supabase.from('subscriptions').update(payload).eq('id', editing.id)
      error = res.error
    } else {
      /* Brand-new subscription — added alongside any existing active plans */
      const res = await supabase.from('subscriptions')
        .insert({ ...payload, user_id: userId, start_date: new Date().toISOString() })
        .select().single()
      error = res.error
      savedId = res.data?.id ?? ''
    }

    if (error) showToast('err', 'Could not save subscription', error.message)
    else {
      await logAudit(admin.id, userId, 'update_subscription', 'subscription', savedId,
        editing ? `${editing.plans?.name ?? '—'} · ${editing.status} · ${editing.bandwidth_used_gb}/${editing.bandwidth_limit_gb} GB` : 'none',
        `${plan?.name ?? '—'} · ${fSubStatus} · ${fUsed}/${fLimit} GB · expires ${fExpiry || '—'}`)
      showToast('ok', 'Subscription saved', `${plan?.name ?? 'Custom'} → ${fSubStatus}`)
      await load(savedId || undefined)
    }
    setSaving(null)
  }

  /* Quick per-plan status toggle from the Active Plans list (expire ↔ reactivate) */
  const setSubStatus = async (sub: Subscription, status: string) => {
    if (!admin || !userId) return
    setSaving('sub-' + sub.id)
    const { error } = await supabase.from('subscriptions').update({ status }).eq('id', sub.id)
    if (error) showToast('err', 'Could not update plan', error.message)
    else {
      await logAudit(admin.id, userId, 'update_subscription_status', 'subscription', sub.id,
        `${sub.plans?.name ?? '—'} · ${sub.status}`, `${sub.plans?.name ?? '—'} · ${status}`)
      showToast('ok', status === 'expired' ? 'Plan expired' : 'Plan activated', sub.plans?.name ?? '')
      await load(sub.id)
    }
    setSaving(null)
  }

  const saveCredentials = async () => {
    if (!admin || !userId) return
    setSaving('creds')
    const payload = {
      user_id: userId,
      dataimpulse_username: fCredUser.trim() || null,
      dataimpulse_password: fCredPass || null,
      host: fCredHost.trim() || 'gate.safestproxy.com',
      port: Number(fCredPort) || 7777,
      status: fCredStatus,
    }
    const q = creds
      ? supabase.from('proxy_credentials').update(payload).eq('id', creds.id).select().single()
      : supabase.from('proxy_credentials').insert(payload).select().single()
    const { data, error } = await q
    if (error) showToast('err', 'Could not save credentials', error.message)
    else {
      await logAudit(admin.id, userId, 'update_proxy_credentials', 'proxy_credential', data.id,
        creds ? `${creds.dataimpulse_username ?? '—'} · ${creds.status}` : 'none',
        `${payload.dataimpulse_username ?? '—'} · ${payload.status} · ${payload.host}:${payload.port}`)
      showToast('ok', 'Proxy credentials saved')
      await load()
    }
    setSaving(null)
  }

  if (loading) {
    return <div className="loading-screen">Loading user dashboard…</div>
  }

  if (!target) {
    return (
      <div className="loading-screen">
        User not found. <Link to="/admin" style={{ marginLeft: 8, color: 'var(--cyan)' }}>Back to Admin Panel</Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="topbar admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="logo-mark">
            <img src={LOGO_URL} alt="SafestProxy" />
            <div className="logo-pulse" />
          </div>
          <div>
            <div className="tb-title" style={{ fontSize: 26 }}>{target.username ?? target.email}</div>
            <div className="tb-sub">{target.email} · joined {new Date(target.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
          <span className="admin-badge">ADMIN VIEW</span>
        </div>
        <Link to="/admin" className="btn btn-secondary btn-sm">Back to Admin Panel</Link>
      </div>

      <div className="admin-panel">
        <div className="admin-tabs">
          {SECTION_TABS.map(t => (
            <button key={t.key} className={cn(section === t.key && 'active')} onClick={() => setSection(t.key)}>{t.label}</button>
          ))}
        </div>

        {section === 'overview' && <Overview userId={userId} />}
        {section === 'usage' && admin && userId && <UsageManager adminId={admin.id} userId={userId} />}
        {section === 'proxy' && <ProxyAccess userId={userId} />}
        {section === 'api' && <ApiManagement userId={userId} />}
        {section === 'plans' && <Plans userId={userId} />}
        {section === 'billing' && <Billing userId={userId} />}
        {section === 'profile' && <ProfileSection userId={userId} />}

        {section === 'manage' && (
          <div className="manage-grid">
            {/* ── Active Plans: every subscription the user owns, with per-plan controls ── */}
            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <div>
                  <h3>User Plans ({allSubs.filter(s => s.status === 'active').length} active · {allSubs.length} total)</h3>
                  <p>Every plan the user has purchased. Expire/activate or select a plan to edit it below.</p>
                </div>
              </div>
              {allSubs.length === 0 && (
                <p style={{ fontSize: 13.5, color: 'var(--text-mid)' }}>This user has no subscriptions yet — create one in the Subscription panel below.</p>
              )}
              {allSubs.map(s => {
                const lim = s.bandwidth_limit_gb ?? 0
                const usd = s.bandwidth_used_gb ?? 0
                const pct = lim > 0 ? Math.min(100, (usd / lim) * 100) : 0
                const isAct = s.status === 'active'
                return (
                  <div className="myplan-row" key={s.id}>
                    <div className="myplan-info">
                      <div className="myplan-name">{s.plans?.name ?? 'Custom plan'}</div>
                      <div className="myplan-meta">
                        {s.expiry_date ? `expires ${new Date(s.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'no expiry'}
                        {' · '}created {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div className="myplan-usage">
                      <span className="mono">{lim > 0 ? `${usd.toFixed(1)} / ${lim} GB used` : 'Unlimited traffic'}</span>
                      {lim > 0 && <div className="myplan-bar"><div className={`myplan-bar-fill${pct >= 100 ? ' bad' : pct >= 80 ? ' warn' : ''}`} style={{ width: `${pct}%` }} /></div>}
                    </div>
                    <span className={cn('tag dot', isAct ? 'ok' : s.status === 'expired' ? 'bad' : 'warn')}>{s.status}</span>
                    <div className="myplan-actions">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => selectSub(s.id)}>Edit</button>
                      {isAct ? (
                        <button className="btn btn-secondary btn-sm" type="button" disabled={saving === 'sub-' + s.id} onClick={() => setSubStatus(s, 'expired')}>
                          {saving === 'sub-' + s.id ? 'Working…' : 'Expire'}
                        </button>
                      ) : (
                        <button className="btn btn-primary btn-sm" type="button" disabled={saving === 'sub-' + s.id} onClick={() => setSubStatus(s, 'active')}>
                          {saving === 'sub-' + s.id ? 'Working…' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="panel">
              <div className="panel-head"><div><h3>Account</h3><p>Username and role for this user.</p></div></div>
              <div className="form-row">
                <label>Email</label>
                <input type="email" value={target.email} disabled />
              </div>
              <div className="form-row">
                <label>Username</label>
                <input type="text" value={fUsername} onChange={e => setFUsername(e.target.value)} placeholder="Display name" />
              </div>
              <div className="toggle-row" style={{ marginBottom: 8 }}>
                <div>
                  <label style={{ marginBottom: 3 }}>Admin role</label>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Grants full access to the admin panel</div>
                </div>
                <button type="button" className={cn('switch', fIsAdmin && 'on')} role="switch" aria-checked={fIsAdmin} onClick={() => setFIsAdmin(v => !v)} />
              </div>
              <div className="manage-save-row">
                <button className="btn btn-primary" disabled={saving === 'profile'} onClick={saveProfile}>{saving === 'profile' ? 'Saving…' : 'Save account'}</button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><div><h3>Subscription</h3><p>Select which of the user's plans to edit, or create a new one. Changes reflect on the user's dashboard immediately — each plan runs independently.</p></div></div>
              <div className="form-row">
                <label>Editing subscription</label>
                <select className="plain-select" value={fSubId} onChange={e => selectSub(e.target.value)}>
                  {allSubs.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.plans?.name ?? 'Custom plan'} · {s.status} · {s.bandwidth_used_gb}/{s.bandwidth_limit_gb} GB
                    </option>
                  ))}
                  <option value="">＋ Create new subscription</option>
                </select>
              </div>
              <div className="form-row">
                <label>Plan</label>
                <select className="plain-select" value={fPlanId} onChange={e => {
                  setFPlanId(e.target.value)
                  const p = plans.find(x => x.id === e.target.value)
                  if (p) setFLimit(String(p.bandwidth_gb))
                }}>
                  <option value="">— No plan —</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} (${Number(p.price)}/mo)</option>)}
                </select>
              </div>
              <div className="field-grid">
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Status</label>
                  <select className="plain-select" value={fSubStatus} onChange={e => setFSubStatus(e.target.value)}>
                    {['active', 'inactive', 'expired', 'suspended'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Expiry date</label>
                  <input type="date" value={fExpiry} onChange={e => setFExpiry(e.target.value)} />
                </div>
              </div>
              <div className="field-grid" style={{ marginTop: 18 }}>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Bandwidth used (GB)</label>
                  <input type="number" min="0" step="0.01" value={fUsed} onChange={e => setFUsed(e.target.value)} />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Bandwidth limit (GB)</label>
                  <input type="number" min="0" value={fLimit} onChange={e => setFLimit(e.target.value)} />
                </div>
              </div>
              <div className="manage-save-row">
                <button className="btn btn-primary" disabled={saving === 'subscription'} onClick={saveSubscription}>{saving === 'subscription' ? 'Saving…' : 'Save subscription'}</button>
                <span className="manage-hint">Setting status to active replaces the current active plan.</span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><div><h3>Proxy Credentials</h3><p>The gateway credentials this user connects with — fully editable.</p></div></div>
              <div className="field-grid">
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Proxy username</label>
                  <input type="text" value={fCredUser} onChange={e => setFCredUser(e.target.value)} placeholder="e.g. u9f3ka82mx1" />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Proxy password</label>
                  <input type="text" value={fCredPass} onChange={e => setFCredPass(e.target.value)} placeholder="Proxy password" />
                </div>
              </div>
              <div className="field-grid" style={{ marginTop: 18 }}>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Host</label>
                  <input type="text" value={fCredHost} onChange={e => setFCredHost(e.target.value)} />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <label>Port</label>
                  <input type="number" value={fCredPort} onChange={e => setFCredPort(e.target.value)} />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 18 }}>
                <label>Status</label>
                <select className="plain-select" value={fCredStatus} onChange={e => setFCredStatus(e.target.value)}>
                  {['active', 'pending', 'suspended'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="manage-save-row">
                <button className="btn btn-primary" disabled={saving === 'creds'} onClick={saveCredentials}>{saving === 'creds' ? 'Saving…' : 'Save credentials'}</button>
                <span className="manage-hint">{creds ? 'Updates the existing credential row.' : 'Creates a new credential row for this user.'}</span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><div><h3>Quick Actions</h3><p>Common admin operations for this user.</p></div></div>
              <div className="admin-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setSection('billing')}>View billing</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSection('proxy')}>View proxy access</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSection('api')}>View API keys</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
