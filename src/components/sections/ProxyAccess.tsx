import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import CustomSelect from '@/components/ui/CustomSelect'
import CountrySelect from '@/components/ui/CountrySelect'
import { safeCopy, randToken, cn } from '@/lib/utils'
import { subIsActive, subIsExpired, subIsExhausted } from '@/lib/subscription'
import { showToast } from '@/lib/toast'
import type { ProxyCredential, Subscription } from '@/types'

const GATEWAY = 'gate.safestproxy.com'
const MAIN_PORT = 7777
const STICKY_START_PORT = 10001
const ROTATING_PORT = 823

interface Generated {
  lines: string[]
  meta: string
  filename: string
}

interface Props {
  userId?: string
}

export default function ProxyAccess({ userId }: Props) {
  const { user } = useAuth()
  const uid = userId ?? user?.id
  const readOnly = !!userId

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [selectedSubId, setSelectedSubId] = useState<string>('')
  const [creds, setCreds] = useState<ProxyCredential | null>(null)
  const [loading, setLoading] = useState(true)
  const [creatingCreds, setCreatingCreds] = useState(false)

  const [protocol, setProtocol] = useState('HTTP')
  const [network, setNetwork] = useState('4g')
  const [countries, setCountries] = useState<{ codes: string[]; names: string[] }>({ codes: [], names: [] })
  const [session, setSession] = useState<'sticky' | 'rotating'>('sticky')
  const [qty, setQty] = useState('10')
  const [qtyError, setQtyError] = useState('')
  const [generated, setGenerated] = useState<Generated | null>(null)
  const [stale, setStale] = useState(false)
  const [genError, setGenError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [passShown, setPassShown] = useState(false)
  const [copyAllLbl, setCopyAllLbl] = useState('Copy all')
  const [downloadLbl, setDownloadLbl] = useState('Download .txt')
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!uid) return
    ;(async () => {
      setLoading(true)
      const [{ data: subs }, { data: cred }] = await Promise.all([
        supabase.from('subscriptions').select('*, plans(*)').eq('user_id', uid)
          .order('created_at', { ascending: false }),
        supabase.from('proxy_credentials').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const list = (subs as Subscription[] | null) ?? []
      setSubscriptions(list)
      /* default selection: first effectively-active plan, else latest row */
      const firstActive = list.find(s => subIsActive(s)) ?? list[0]
      setSelectedSubId(prev => (prev && list.some(s => s.id === prev) ? prev : firstActive?.id ?? ''))
      setCreds((cred as ProxyCredential | null) ?? null)
      setLoading(false)
    })()
  }, [uid])

  /* Multi-plan model: the user picks WHICH plan to generate from */
  const activeSubs = subscriptions.filter(s => subIsActive(s))
  const subscription = subscriptions.find(s => s.id === selectedSubId) ?? activeSubs[0] ?? subscriptions[0] ?? null
  const active = subIsActive(subscription)
  const expired = subIsExpired(subscription)
  const exhausted = subIsExhausted(subscription)
  const isMobilePlan = (subscription?.plans?.name ?? '').startsWith('Mobile')
  const hasAnyPlan = subscriptions.length > 0
  /* Gate on loading so banners never flash while data is being fetched */
  const showExpired = !loading && hasAnyPlan && activeSubs.length === 0
  const showExhausted = !loading && active && exhausted
  const showNoPlan = !loading && !hasAnyPlan

  const markDirty = () => { if (generated) setStale(true) }

  const validateQty = (): number | null => {
    const raw = qty.trim()
    setQtyError('')
    if (raw === '' || isNaN(Number(raw)) || !/^\d+$/.test(raw)) { setQtyError('Enter a valid number.'); return null }
    const v = parseInt(raw, 10)
    if (v < 1) { setQtyError('Minimum pool quantity is 1.'); return null }
    if (v > 3000) { setQtyError('Maximum pool quantity is 3,000.'); return null }
    return v
  }

  const createCredentials = async () => {
    if (!uid || !active) return
    setCreatingCreds(true)
    const username = `u${randToken(10).toLowerCase()}`
    const password = randToken(12)
    const { data, error } = await supabase
      .from('proxy_credentials')
      .insert({ user_id: uid, username, password, host: GATEWAY, port: MAIN_PORT, status: 'active' })
      .select()
      .single()
    setCreatingCreds(false)
    if (error) {
      showToast('err', 'Could not create credentials', error.message)
      return
    }
    setCreds(data as ProxyCredential)
    showToast('ok', 'Proxy credentials created', 'Your gateway credentials are ready to use.')
  }

  const generateProxies = () => {
    const q = validateQty()
    if (q === null) return
    setGenError('')

    if (expired) {
      setGenError('Your plan has expired. Renew or upgrade your plan to continue generating proxies.')
      return
    }
    if (!active || exhausted) {
      setGenError("You don't have any funds/bandwidth available.")
      return
    }
    if (!creds || !creds.dataimpulse_username || !creds.dataimpulse_password) {
      setGenError('Generate your proxy credentials first.')
      return
    }

    const credUser = creds.dataimpulse_username
    const credPass = creds.dataimpulse_password
    const credHost = creds.host || GATEWAY

    setGenerating(true)
    setTimeout(() => {
      try {
        const codes = countries.codes.map(c => c.toLowerCase())
        const crPart = codes.length ? `__cr.${codes.join(',')}` : ''
        const locUser = `${credUser}${crPart}`
        const countryLabel = codes.length ? countries.names.join(', ') : 'Random Country'
        const planLabel = subscription?.plans?.name ?? 'Plan'
        const netLabel = isMobilePlan ? ` · ${network.toUpperCase()}` : ''
        const lines: string[] = new Array(q)
        for (let i = 0; i < q; i++) {
          // Sticky → sequential port per proxy (same IP per port for the session)
          // Rotating → one fixed port; the gateway rotates the IP on every request
          const port = session === 'sticky' ? STICKY_START_PORT + i : ROTATING_PORT
          lines[i] = `${credHost}:${port}:${locUser}:${credPass}`
        }
        setGenerated({
          lines,
          meta: `${q.toLocaleString()} ${q === 1 ? 'proxy' : 'proxies'} · ${planLabel} · ${protocol} · ${session === 'sticky' ? 'Sticky' : 'Rotating'}${netLabel} · ${countryLabel}`,
          filename: `safestproxy-${codes.length ? codes.join('-') : 'mix'}-${session}${isMobilePlan ? '-' + network : ''}-${q}-proxies.txt`,
        })
        setStale(false)
        outputRef.current?.scrollTo({ top: 0 })
      } catch {
        setGenError('Unable to generate proxy pool. Please try again.')
      } finally {
        setGenerating(false)
      }
    }, 650)
  }

  const copyText = (text: string, e: React.MouseEvent<HTMLButtonElement>) => {
    safeCopy(text, () => showToast('ok', 'Copied to clipboard.'))
    const btn = e.currentTarget
    const old = btn.innerHTML
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
    setTimeout(() => { btn.innerHTML = old }, 1200)
  }

  const copyProxyList = () => {
    if (!generated) return
    safeCopy(generated.lines.join('\n'))
    setCopyAllLbl('Copied!')
    setTimeout(() => setCopyAllLbl('Copy all'), 1600)
  }

  const downloadProxyList = () => {
    if (!generated) return
    const blob = new Blob([generated.lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = generated.filename
    a.click()
    URL.revokeObjectURL(a.href)
    setDownloadLbl('Downloaded!')
    setTimeout(() => setDownloadLbl('Download .txt'), 1600)
  }

  const shownLines = generated ? generated.lines.slice(0, 200) : []

  return (
    <section className="section active">
      {showExpired && (
        <div className="warn-banner">
          {readOnly
            ? "This user's plan has expired — proxy generation is disabled."
            : (<>Your plan has expired. <Link to="/plans">Renew or upgrade your plan</Link> to continue using the residential proxy, or <a href="mailto:support@safestproxy.com">contact support</a> for an extension.</>)}
        </div>
      )}
      {showExhausted && (
        <div className="warn-banner">
          {readOnly
            ? "This user's bandwidth is fully used — proxy generation is disabled."
            : (<>Your plan's bandwidth is fully used. <Link to="/plans">Upgrade your plan</Link> to keep generating proxies.</>)}
        </div>
      )}
      {showNoPlan && (
        <div className="warn-banner">
          Your balance is empty! {readOnly ? 'The user needs to refill their balance' : (<Link to="/billing">Refill your balance</Link>)} to use the residential proxy.
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Proxy Access</h3>
            <div className="inner-eyebrow" style={{ margin: '8px 0 0' }}>Credentials</div>
            <p style={{ marginTop: 8 }}>Configure a residential connection, then use the generated credentials in your existing tools.</p>
          </div>
        </div>

        {/* Multi-plan picker — every active plan can be selected for generation */}
        {hasAnyPlan && (
          <div className="plan-pick-row">
            <div className="form-row" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
              <label>Select plan</label>
              <CustomSelect
                options={subscriptions.map(s => ({
                  value: s.id,
                  label: `${s.plans?.name ?? 'Plan'}${subIsActive(s) ? '' : subIsExpired(s) ? ' (expired)' : ''}`,
                }))}
                value={selectedSubId}
                onChange={v => { setSelectedSubId(v); markDirty() }}
                emptyMsg="You don't have any plans yet."
              />
            </div>
            {subscription && active && (
              <div className="plan-pick-usage">
                <span className="mono">
                  {subscription.bandwidth_limit_gb > 0
                    ? `${subscription.bandwidth_used_gb.toFixed(1)} / ${subscription.bandwidth_limit_gb} GB used`
                    : 'Unlimited traffic'}
                </span>
                {subscription.bandwidth_limit_gb > 0 && (
                  <div className="plan-pick-bar">
                    <div className="plan-pick-bar-fill" style={{ width: `${Math.min(100, (subscription.bandwidth_used_gb / subscription.bandwidth_limit_gb) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="field-grid cols-4">
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Protocol</label>
            <CustomSelect
              options={[
                { value: 'HTTP', label: 'HTTP Proxy' },
                { value: 'HTTPS', label: 'HTTPS Proxy' },
                { value: 'SOCKS5', label: 'SOCKS5 Proxy' },
              ]}
              value={protocol}
              onChange={v => { setProtocol(v); markDirty() }}
            />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Location</label>
            <CountrySelect value={countries.codes} onChange={(codes, names) => { setCountries({ codes, names }); markDirty() }} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Session</label>
            <CustomSelect
              options={[
                { value: 'sticky', label: 'Sticky Session' },
                { value: 'rotating', label: 'Rotating Session' },
              ]}
              value={session}
              onChange={v => { setSession(v as 'sticky' | 'rotating'); markDirty() }}
            />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Gateway</label>
            <div className="static-field">DNS Hostname</div>
          </div>
          {isMobilePlan && (
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>
                Network
                <span className="help">?<span className="tooltip">Mobile plans run on real carrier networks — pick the network type your targets expect. 4G/LTE covers most use cases; 5G gives the highest trust score.</span></span>
              </label>
              <CustomSelect
                options={[
                  { value: '4g', label: '4G / LTE' },
                  { value: '5g', label: '5G' },
                  { value: '3g', label: '3G' },
                ]}
                value={network}
                onChange={v => { setNetwork(v); markDirty() }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="help-link" onClick={() => showToast('ok', 'Need help?', 'Contact support@safestproxy.com')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
            Need help?
          </button>
        </div>

        <div className="inner-card">
          <div className="inner-eyebrow">Generated Connection</div>
          <div className="inner-title-row">
            <div className="inner-title">Connection credentials</div>
            <span className={cn('tag dot', creds && creds.status === 'active' ? 'ok' : 'warn')}>
              {loading ? 'Loading…' : creds ? (creds.status === 'active' ? 'Ready' : creds.status) : 'Not created'}
            </span>
          </div>

          {creds ? (
            <>
              <div className="cred-inline-row">
                <span className="cr-label">HTTP Proxy Host</span>
                <span className="cr-input">{creds.host || GATEWAY}</span>
                <div className="cr-btns">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={e => copyText(creds.host || GATEWAY, e)}>Copy</button>
                </div>
              </div>
              <div className="cred-inline-row">
                <span className="cr-label">Proxy Port</span>
                <span className="cr-input">{creds.port || MAIN_PORT}</span>
                <div className="cr-btns">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={e => copyText(String(creds.port || MAIN_PORT), e)}>Copy</button>
                </div>
              </div>
              <div className="cred-inline-row">
                <span className="cr-label">Proxy Username</span>
                <span className="cr-input">{creds.dataimpulse_username}</span>
                <div className="cr-btns">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={e => copyText(creds.dataimpulse_username ?? '', e)}>Copy</button>
                </div>
              </div>
              <div className="cred-inline-row">
                <span className="cr-label">Proxy Password</span>
                <span className="cr-input">{passShown ? creds.dataimpulse_password : '••••••••••••'}</span>
                <div className="cr-btns">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPassShown(s => !s)}>{passShown ? 'Hide' : 'Show'}</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={e => copyText(creds.dataimpulse_password ?? '', e)}>Copy</button>
                </div>
              </div>

              {!readOnly && (
                <div style={{ marginTop: 20 }}>
                  <button type="button" className="text-link" onClick={() => showToast('ok', 'To reset your proxy password', 'Contact support@safestproxy.com')}>Reset Proxy Password</button>
                  <span className="help" style={{ marginLeft: 8 }} aria-label="Reset info">?<span className="tooltip">If you want to reset your credentials, simply contact our support team. Please note: if you use these credentials with another bot or connect them to another service, your proxy may stop working. After resetting your credentials, you will need to regenerate your proxy credentials again.</span></span>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '8px 0 4px' }}>
              {loading ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-mid)' }}>Loading credentials…</p>
              ) : readOnly ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-mid)' }}>This user has not generated proxy credentials yet.</p>
              ) : active ? (
                <>
                  <p style={{ fontSize: 13.5, color: 'var(--text-mid)', marginBottom: 14 }}>You don't have proxy credentials yet. Generate them to connect to the network.</p>
                  <button className="btn btn-primary" type="button" disabled={creatingCreds} onClick={createCredentials}>
                    {creatingCreds ? 'Generating…' : 'Generate credentials'}
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 13.5, color: 'var(--text-mid)' }}>You don't have any funds/bandwidth available. Choose a plan first to generate credentials.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Basic cURL Example</h3>
            <p>Test your connection with a single command</p>
          </div>
        </div>
        <div className="code-block">
          <div className="cb-head">
            <div className="cb-dots"><i /><i /><i /></div>
            <span className="cb-title">Terminal</span>
          </div>
          <pre>
            <span className="tk-cmd">curl</span> <span className="tk-flag">-x</span>{' '}
            <span className="tk-str">http://{creds ? `${creds.dataimpulse_username}:${creds.dataimpulse_password}` : 'USERNAME:PASSWORD'}@{creds?.host || GATEWAY}:{creds?.port || MAIN_PORT}</span>{' '}
            <span className="tk-url">https://api.ipify.org</span>
          </pre>
        </div>
      </div>

      {!readOnly && (
        <>
          <div className="panel">
            <div className="panel-head">
              <div><h3>Proxy Pool Generator</h3><p>Choose your target and generate a proxy pool</p></div>
            </div>

            <div className="form-row">
              <div className="toggle-row">
                <div>
                  <label style={{ marginBottom: 3 }}>
                    {session === 'sticky' ? 'Sticky session' : 'Rotating session'}
                    <span className="help">?<span className="tooltip">
                      {session === 'sticky'
                        ? 'Sticky sessions keep the same IP for the whole session. Each proxy in the pool gets its own sequential port (starting at 10001). Switch the Session option above for rotation on every request.'
                        : 'Rotating sessions give you a new IP on every request. Every proxy in the pool uses the same port (823) — rotation happens automatically at the gateway.'}
                    </span></span>
                  </label>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {session === 'sticky'
                      ? `Same IP per session · sequential ports from ${STICKY_START_PORT}`
                      : `New IP on every request · fixed port ${ROTATING_PORT}`}
                  </div>
                </div>
                <span className="gen-meta-chip live">{session === 'sticky' ? 'STICKY' : 'ROTATING'}</span>
              </div>
            </div>

            <div className="field-grid">
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Pool quantity</label>
                <div className="qty-wrap">
                  <input
                    type="text"
                    value={qty}
                    inputMode="numeric"
                    placeholder="1 – 3,000"
                    autoComplete="off"
                    className={cn(qtyError && 'invalid')}
                    onChange={e => { setQty(e.target.value); setQtyError(''); markDirty() }}
                    onBlur={validateQty}
                  />
                  <div className="qty-steps">
                    <button type="button" className="qty-step" aria-label="Decrease quantity"
                      onClick={() => { const v = validateQty() ?? 500; setQty(String(Math.max(1, v - 1))); setQtyError(''); markDirty() }}>−</button>
                    <button type="button" className="qty-step" aria-label="Increase quantity"
                      onClick={() => { const v = validateQty() ?? 500; setQty(String(Math.min(3000, v + 1))); setQtyError(''); markDirty() }}>+</button>
                  </div>
                </div>
                <div className="qty-hint">Maximum: 3,000 proxies · enter any value from 1 to 3,000</div>
                <div className={cn('qty-error', qtyError && 'show')}>{qtyError}</div>
              </div>
              <div className="form-row" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-start' }}>
                <button
                  className={cn('btn btn-primary btn-generate', generating && 'loading')}
                  type="button"
                  onClick={generateProxies}
                  style={{ marginTop: 23 }}
                  disabled={generating}
                >
                  <span className="gen-spinner" />
                  <svg className="gen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={generating ? { display: 'none' } : undefined}><path d="M12 5v14M5 12h14" /></svg>
                  <span>{generating ? `Generating ${parseInt(qty || '0', 10).toLocaleString()} ${parseInt(qty || '0', 10) === 1 ? 'proxy' : 'proxies'}...` : 'Generate proxy pool'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Formatted:Proxy:List</h3>
                <div className="gen-meta" style={{ marginTop: 10 }}>
                  <span className="gen-meta-chip">{generated ? generated.meta : 'No pool generated yet'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={copyProxyList} disabled={!generated}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                  <span>{copyAllLbl}</span>
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={downloadProxyList} disabled={!generated}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
                  <span>{downloadLbl}</span>
                </button>
              </div>
            </div>

            <div className={cn('gen-stale', stale && 'show')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
              Configuration changed — generate a new proxy pool to apply changes.
            </div>
            <div className={cn('gen-error', genError && 'show')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              {genError || 'Unable to generate proxy pool. Please try again.'}
            </div>

            <pre className="proxy-output" ref={outputRef}>
              {shownLines.map((l, i) => <span key={i} className="proxy-line">{l}</span>)}
              {generated && generated.lines.length > shownLines.length && (
                <span className="proxy-line" style={{ color: 'var(--text-dim)' }}>… +{(generated.lines.length - shownLines.length).toLocaleString()} more (full list via Copy all or Download)</span>
              )}
            </pre>
          </div>
        </>
      )}
    </section>
  )
}
