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
import type { Plan, Profile, ProxyCredential, Subscription } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/dhcryevaj/image/upload/v1785014439/Safestproxy_favicon_oknort.png'

type SectionKey = 'overview' | 'proxy' | 'api' | 'plans' | 'billing' | 'profile' | 'manage'

const SECTION_TABS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
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
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [creds, setCreds] = useState<ProxyCredential | null>(null)
  const [loading, setLoading] = useState(true)

  // manage form state
  const [fUsername, setFUsername] = useState('')
  const [fIsAdmin, setFIsAdmin] = useState(false)
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

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [{ data: p }, { data: pl }, { data: s }, { data: c }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('plans').select('*').order('price', { ascending: true }),
      supabase.from('subscriptions').select('*, plans(*)').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('proxy_credentials').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const prof = (p as Profile | null) ?? null
    const sub = (s as Subscription | null) ?? null
    const cred = (c as ProxyCredential | null) ?? null
    setTarget(prof)
    setPlans((pl as Plan[] | null) ?? [])
    setSubscription(sub)
    setCreds(cred)

    setFUsername(prof?.username ?? '')
    setFIsAdmin(!!prof?.is_admin)
    setFPlanId(sub?.plan_id ?? '')
    setFSubStatus(sub?.status ?? 'active')
    setFUsed(String(sub?.bandwidth_used_gb ?? 0))
    setFLimit(String(sub?.bandwidth_limit_gb ?? 0))
    setFExpiry(sub?.expiry_date ? sub.expiry_date.slice(0, 10) : '')
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
    const payload = {
      user_id: userId,
      plan_id: fPlanId || null,
      status: fSubStatus,
      bandwidth_used_gb: Number(fUsed) || 0,
      bandwidth_limit_gb: Number(fLimit) || 0,
      start_date: subscription?.start_date ?? new Date().toISOString(),
      expiry_date: fExpiry ? new Date(fExpiry + 'T23:59:59Z').toISOString() : null,
    }
    if (fSubStatus === 'active') {
      await supabase.from('subscriptions').update({ status: 'expired' }).eq('user_id', userId).eq('status', 'active')
    }
    const { data, error } = await supabase.from('subscriptions').insert(payload).select().single()
    if (error) showToast('err', 'Could not save subscription', error.message)
    else {
      await logAudit(admin.id, userId, 'update_subscription', 'subscription', data.id,
        subscription ? `${subscription.plans?.name ?? '—'} · ${subscription.status} · ${subscription.bandwidth_used_gb}/${subscription.bandwidth_limit_gb} GB` : 'none',
        `${plan?.name ?? '—'} · ${fSubStatus} · ${fUsed}/${fLimit} GB · expires ${fExpiry || '—'}`)
      showToast('ok', 'Subscription saved', `${plan?.name ?? 'Custom'} → ${fSubStatus}`)
      await load()
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
        {section === 'proxy' && <ProxyAccess userId={userId} />}
        {section === 'api' && <ApiManagement userId={userId} />}
        {section === 'plans' && <Plans userId={userId} />}
        {section === 'billing' && <Billing userId={userId} />}
        {section === 'profile' && <ProfileSection userId={userId} />}

        {section === 'manage' && (
          <div className="manage-grid">
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
              <div className="panel-head"><div><h3>Subscription</h3><p>Assign or edit the user's plan. Saving creates a new subscription row and expires the current one when set to active.</p></div></div>
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
