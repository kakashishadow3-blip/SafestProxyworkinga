import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Modal from '@/components/ui/Modal'
import { fmtDate, fmtReq, maskKey, randKey, safeCopy, cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import type { ApiKey, ApiRequest } from '@/types'

type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected'

const PROVIDERS = ['Bright Data', 'Oxylabs', 'Decodo', 'SOAX', 'IPRoyal', 'Other']

interface Props {
  userId?: string
}

export default function ApiManagement({ userId }: Props) {
  const { user } = useAuth()
  const uid = userId ?? user?.id
  const readOnly = !!userId

  const [loading, setLoading] = useState(true)
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('none')
  const [keys, setKeys] = useState<ApiKey[]>([])

  // request form
  const [showForm, setShowForm] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [teamSize, setTeamSize] = useState('Just me')
  const [integration, setIntegration] = useState('')
  const [volume, setVolume] = useState('Less than 10K requests/month')
  const [usedOther, setUsedOther] = useState<'yes' | 'no'>('no')
  const [providers, setProviders] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [errPurpose, setErrPurpose] = useState(false)
  const [errIntegration, setErrIntegration] = useState(false)
  const [errProviders, setErrProviders] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // key generation
  const [projName, setProjName] = useState('')
  const [errProjName, setErrProjName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  // revoke / delete
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null)
  const [deleteKey, setDeleteKey] = useState<ApiKey | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const formRef = useRef<HTMLDivElement>(null)
  const projInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!uid) return
    setLoading(true)
    const [{ data: reqs }, { data: keyRows }] = await Promise.all([
      supabase.from('api_requests').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(1),
      supabase.from('api_keys').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    ])
    const latest = (reqs?.[0] as ApiRequest | undefined) ?? null
    setAccessStatus(latest ? latest.status : 'none')
    setKeys((keyRows as ApiKey[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitRequest = async () => {
    let ok = true
    if (!purpose) { setErrPurpose(true); ok = false }
    if (!integration.trim()) { setErrIntegration(true); ok = false }
    if (usedOther === 'yes' && providers.length === 0) { setErrProviders(true); ok = false }
    if (!ok) { showToast('err', 'Please complete the highlighted fields.'); return }
    setSubmitting(true)
    const { error } = await supabase.from('api_requests').insert({
      user_id: uid,
      purpose,
      team_size: teamSize,
      integration: integration.trim(),
      expected_volume: volume,
      used_other_providers: usedOther === 'yes',
      recent_providers: usedOther === 'yes' ? providers : [],
      notes: notes.trim(),
      status: 'pending',
    })
    setSubmitting(false)
    if (error) { showToast('err', 'Could not submit request', error.message); return }
    setAccessStatus('pending')
    setShowForm(false)
    showToast('ok', 'Request submitted', 'Our team will review your application and notify you once API access is approved.')
  }

  const generateApiKey = async () => {
    if (accessStatus !== 'approved') {
      showToast('err', 'API Access Required', 'Submit an API Integration Access Request — once approved, you can generate your API key.')
      return
    }
    const name = projName.trim()
    if (!name) { setErrProjName('Please enter a project name.'); projInputRef.current?.focus(); return }
    if (name.length > 60) { setErrProjName('Please keep the project name under 60 characters.'); return }
    setErrProjName('')
    setGenerating(true)

    const fullKey = randKey()
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fullKey))
    const keyHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

    const { data, error } = await supabase.from('api_keys').insert({
      user_id: uid,
      name,
      key_masked: maskKey(fullKey),
      key_hash: keyHash,
      status: 'active',
      requests_count: 0,
    }).select().single()
    setGenerating(false)
    if (error) { showToast('err', 'Could not generate API key', error.message); return }
    setKeys(k => [data as ApiKey, ...k])
    setProjName('')
    setPendingKey(fullKey)
  }

  const closeKeyModal = () => {
    setPendingKey(null)
    showToast('ok', 'API key generated successfully.', 'The full key will not be shown again.')
  }

  const confirmRevoke = async () => {
    if (!revokeKey) return
    setRevoking(true)
    const { error } = await supabase.from('api_keys').update({ status: 'revoked' }).eq('id', revokeKey.id)
    setRevoking(false)
    if (error) { showToast('err', 'Could not revoke key', error.message); return }
    setKeys(ks => ks.map(k => k.id === revokeKey.id ? { ...k, status: 'revoked' } : k))
    setRevokeKey(null)
    showToast('ok', 'API key revoked successfully.', 'This key can no longer access your proxy pool.')
  }

  const confirmDelete = async () => {
    if (!deleteKey || deleteKey.status !== 'revoked') return
    setDeleting(true)
    const { error } = await supabase.from('api_keys').delete().eq('id', deleteKey.id)
    setDeleting(false)
    if (error) { showToast('err', 'Could not delete key', error.message); return }
    setKeys(ks => ks.filter(k => k.id !== deleteKey.id))
    setDeleteKey(null)
    showToast('ok', 'API key deleted successfully.', 'The revoked API key has been permanently removed.')
  }

  const toggleProvider = (p: string) => {
    setErrProviders(false)
    setProviders(ps => ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p])
  }

  const unlocked = accessStatus === 'approved'

  return (
    <section className="section active">
      {/* introduction */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Get Instant Access to Millions of IPs</h3>
            <p>Easily integrate our proxy network with your tools, bots, and applications. Submit your API access request to get started.</p>
          </div>
        </div>
        <div className="api-pricing-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3l7 7-8.5 8.5-4-4L3 20" /><path d="M13.5 6.5l4 4" /></svg>
          <span>API pricing &amp; usage</span>
          <span className="u-info-icon" tabIndex={0} aria-label="How API charging works">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            <span className="u-tooltip">API usage is charged per request. The more requests your API key makes, the more balance will be charged. Please make sure your account has sufficient balance before using the API.</span>
          </span>
          <span className="note-sub">Charged per request from your account balance</span>
        </div>
      </div>

      {/* approval status */}
      {!loading && (accessStatus === 'none' || accessStatus === 'rejected') && (
        <div className="panel">
          <div className="api-status required">
            <div className="as-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg></div>
            <div className="as-body">
              <h4>API Access Required {accessStatus === 'rejected' && <span className="tag revoked dot">Previous request rejected</span>}</h4>
              <p>Before generating an API key, you need to submit an API Integration Access Request. Once your request has been reviewed and approved, you will be able to generate your API key.</p>
              {!readOnly && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setShowForm(true)
                    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
                  }}
                >
                  Request API Access
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && accessStatus === 'pending' && (
        <div className="panel">
          <div className="api-status pending">
            <div className="as-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg></div>
            <div className="as-body">
              <h4>Request Submitted <span className="tag warn dot">Pending review</span></h4>
              <p>Your API access request has been submitted successfully. Our team will review your application and notify you once API access is approved. The Generate API Key option will remain locked until then.</p>
            </div>
          </div>
        </div>
      )}

      {!loading && accessStatus === 'approved' && (
        <div className="panel">
          <div className="api-status approved">
            <div className="as-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6L9 17l-5-5" /></svg></div>
            <div className="as-body">
              <h4>API Access Approved</h4>
              <p>Your API access has been approved. You can now generate your API key and integrate it with your tools.</p>
            </div>
          </div>
        </div>
      )}

      {/* request form */}
      {!readOnly && showForm && (accessStatus === 'none' || accessStatus === 'rejected') && (
        <div className="panel" ref={formRef}>
          <div className="panel-head">
            <div>
              <h3>API Integration Access Request</h3>
              <p>Tell us how you plan to use the API — our team reviews every request manually.</p>
            </div>
          </div>

          <div className="field-grid">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>What is the primary purpose of using our API?</label>
              <select className="plain-select" value={purpose} onChange={e => { setPurpose(e.target.value); setErrPurpose(false) }}>
                <option value="">Select a purpose…</option>
                {['Web scraping', 'Data collection', 'Automation', 'SEO / SERP', 'Market research', 'AI / LLM applications', 'Monitoring', 'Other'].map(p => <option key={p}>{p}</option>)}
              </select>
              <div className={cn('api-field-error', errPurpose && 'show')}>Please select the primary purpose of your API usage.</div>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>How many people are currently on your team?</label>
              <select className="plain-select" value={teamSize} onChange={e => setTeamSize(e.target.value)}>
                {['Just me', '2–5', '6–20', '21–50', '50+'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <label>How do you plan to integrate our API?</label>
            <textarea
              placeholder="Describe your intended integration and use case — e.g. the tools, bots or applications you will connect, and what you will use the proxies for…"
              maxLength={2000}
              value={integration}
              onChange={e => { setIntegration(e.target.value); setErrIntegration(false) }}
            />
            <div className={cn('api-field-error', errIntegration && 'show')}>Please briefly describe your intended integration or use case.</div>
          </div>

          <div className="field-grid">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>What estimated API request volume do you expect?</label>
              <select className="plain-select" value={volume} onChange={e => setVolume(e.target.value)}>
                {['Less than 10K requests/month', '10K–100K requests/month', '100K–1M requests/month', '1M–10M requests/month', '10M+ requests/month'].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Have you recently used API/proxy services from other providers?</label>
              <div className="yn-seg" role="radiogroup" aria-label="Used other providers">
                <button
                  type="button"
                  role="radio"
                  aria-checked={usedOther === 'yes'}
                  className={cn('yn-opt', usedOther === 'yes' && 'on')}
                  onClick={() => setUsedOther('yes')}
                >
                  <span className="yn-dot" />
                  Yes
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={usedOther === 'no'}
                  className={cn('yn-opt', usedOther === 'no' && 'on')}
                  onClick={() => { setUsedOther('no'); setProviders([]); setErrProviders(false) }}
                >
                  <span className="yn-dot" />
                  No
                </button>
              </div>
            </div>
          </div>

          {usedOther === 'yes' && (
            <div className="form-row">
              <label>Which providers have you used recently?</label>
              <div className="prov-grid">
                {PROVIDERS.map(p => {
                  const on = providers.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      className={cn('prov-chip', on && 'on')}
                      onClick={() => toggleProvider(p)}
                    >
                      <span className="prov-box" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="M4 12l5 5L20 6" /></svg>
                      </span>
                      {p}
                    </button>
                  )
                })}
              </div>
              <div className={cn('api-field-error', errProviders && 'show')}>Please select at least one provider, or switch your answer above to “No”.</div>
            </div>
          )}

          <div className="form-row">
            <label>Please tell us anything else about your API integration or requirements. <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}>(optional)</span></label>
            <textarea placeholder="Optional — target regions, protocols, concurrency needs, timelines…" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <button className={cn('btn btn-primary', submitting && 'loading')} type="button" disabled={submitting} onClick={submitRequest}>
            <span className="gen-spinner" />
            <span>{submitting ? 'Submitting...' : 'Submit API Access Request'}</span>
          </button>
        </div>
      )}

      {/* key generation — unlocked only after approval */}
      {!loading && unlocked && !readOnly && (
        <div className="panel">
          <div className="panel-head">
            <div><h3>Create new project</h3><p>Each project gets its own unique API key</p></div>
          </div>
          <div className="field-grid">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Project name</label>
              <input
                ref={projInputRef}
                type="text"
                placeholder="e.g. Scraper Bot 1"
                maxLength={60}
                autoComplete="off"
                value={projName}
                onChange={e => { setProjName(e.target.value); setErrProjName('') }}
              />
              <div className={cn('api-field-error', errProjName && 'show')}>{errProjName || 'Please enter a project name.'}</div>
            </div>
            <div className="form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-start' }}>
              <button className={cn('btn btn-primary btn-genkey', generating && 'loading')} type="button" disabled={generating} onClick={generateApiKey} style={{ marginTop: 24 }}>
                <span className="gen-spinner" />
                <svg className="gen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={generating ? { display: 'none' } : undefined}><path d="M14 3l7 7-8.5 8.5-4-4L3 20" /><path d="M13.5 6.5l4 4" /></svg>
                <span>{generating ? 'Generating...' : 'Generate API key'}</span>
              </button>
            </div>
          </div>
          <div className="api-pricing-note" style={{ marginTop: 22 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <span>Request-based charging</span>
            <span className="u-info-icon" tabIndex={0} aria-label="How API charging works">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span className="u-tooltip">API usage is charged per request. The more requests your API key makes, the more balance will be charged. Please make sure your account has sufficient balance before using the API.</span>
            </span>
            <span className="note-sub">Every request your API key makes consumes balance, based on the applicable request charge.</span>
          </div>
        </div>
      )}

      {/* key list */}
      {!loading && (unlocked || (readOnly && keys.length > 0)) && (
        <div className="panel">
          <div className="panel-head">
            <div><h3>Your API keys</h3><p>Keep these secret — anyone with a key can access your proxy pool</p></div>
          </div>
          {keys.length > 0 ? (
            <div className="api-table-wrap">
              <table>
                <thead><tr><th>Project</th><th>API key</th><th>Created</th><th>Requests</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                <tbody>
                  {keys.map(k => {
                    const tagCls = k.status === 'active' ? 'ok' : k.status === 'idle' ? 'warn' : 'revoked'
                    const tagTxt = k.status === 'active' ? 'Active' : k.status === 'idle' ? 'Idle' : 'Revoked'
                    return (
                      <tr key={k.id}>
                        <td className="api-proj">{k.name}</td>
                        <td><span className="api-key-mono">{k.key_masked}</span></td>
                        <td className="mono">{fmtDate(new Date(k.created_at))}</td>
                        <td className="mono">{fmtReq(k.requests_count)}</td>
                        <td><span className={cn('tag dot', tagCls)}>{tagTxt}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          {!readOnly && (k.status === 'revoked'
                            ? <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDeleteKey(k)}>Delete</button>
                            : <button className="btn btn-ghost btn-sm" type="button" onClick={() => setRevokeKey(k)}>Revoke</button>)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="api-empty show">
              <div className="ae-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 3l7 7-8.5 8.5-4-4L3 20" /><path d="M13.5 6.5l4 4" /></svg></div>
              <h4>No API keys yet</h4>
              <p>Create your first API key to start using SafestProxy programmatically.</p>
              {!readOnly && <button className="btn btn-primary" type="button" onClick={() => projInputRef.current?.focus()}>Generate API key</button>}
            </div>
          )}
        </div>
      )}

      {/* one-time key modal */}
      <Modal open={!!pendingKey} onClose={closeKeyModal}>
        <div className="modal-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M20 6L9 17l-5-5" /></svg></div>
        <h3>API key created</h3>
        <p className="modal-sub">Your API key has been generated successfully. For security, this key will only be shown once. Please save it somewhere secure before closing this window.</p>
        <div className="modal-keybox">
          <code>{pendingKey}</code>
          <button className="icon-mini-btn" type="button" title="Copy API key" style={{ width: 36, height: 36 }} onClick={() => { if (pendingKey) { safeCopy(pendingKey); showToast('ok', 'API key copied to clipboard.') } }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          </button>
        </div>
        <div className="modal-warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          This is the only time the full key will be displayed.
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" type="button" onClick={closeKeyModal} autoFocus>I've saved it</button>
        </div>
      </Modal>

      {/* revoke confirmation */}
      <Modal open={!!revokeKey} onClose={() => !revoking && setRevokeKey(null)} maxWidth={440}>
        <h3>Revoke API key?</h3>
        <p className="modal-sub">This action will permanently revoke <strong style={{ color: 'var(--text-hi)' }}>{revokeKey?.name}</strong> and stop it from being used to access your proxy pool.</p>
        <div className="modal-warn danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          Revoked keys cannot be restored.
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" disabled={revoking} onClick={() => setRevokeKey(null)}>Cancel</button>
          <button className="btn btn-danger" type="button" disabled={revoking} onClick={confirmRevoke}>{revoking ? 'Revoking...' : 'Revoke API key'}</button>
        </div>
      </Modal>

      {/* delete confirmation */}
      <Modal open={!!deleteKey} onClose={() => !deleting && setDeleteKey(null)} maxWidth={440}>
        <h3>Delete revoked key?</h3>
        <p className="modal-sub">This will permanently remove <strong style={{ color: 'var(--text-hi)' }}>{deleteKey?.name}</strong> and its project record from your API Management list.</p>
        <div className="modal-warn danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
          This action is permanent and cannot be undone.
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" disabled={deleting} onClick={() => setDeleteKey(null)}>Cancel</button>
          <button className="btn btn-danger" type="button" disabled={deleting} onClick={confirmDelete}>{deleting ? 'Deleting...' : 'Delete permanently'}</button>
        </div>
      </Modal>
    </section>
  )
}
