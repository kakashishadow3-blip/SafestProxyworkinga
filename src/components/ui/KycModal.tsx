import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { COUNTRIES } from '@/lib/countries'
import { pushNotification } from '@/lib/notifications'

interface Props {
  open: boolean
  userId: string
  initialCountry?: string          // resubmission: keep the previously selected country
  startAtUpload?: boolean          // resubmission: jump straight to document upload
  onClose: () => void
  onSubmitted: () => void
}

type Step = 'intro' | 'country' | 'upload' | 'confirm' | 'success'

const MAX_FILE_MB = 10
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

interface DocFile {
  file: File
  preview: string | null   // object URL for images, null for PDFs
}

export default function KycModal({ open, userId, initialCountry, startAtUpload, onClose, onSubmitted }: Props) {
  const [step, setStep] = useState<Step>('intro')
  const [agreed, setAgreed] = useState(false)
  const [agreeErr, setAgreeErr] = useState(false)

  const [country, setCountry] = useState('')
  const [countryQuery, setCountryQuery] = useState('')
  const [countryErr, setCountryErr] = useState(false)

  const [front, setFront] = useState<DocFile | null>(null)
  const [back, setBack] = useState<DocFile | null>(null)
  const [frontErr, setFrontErr] = useState('')
  const [backErr, setBackErr] = useState('')
  const [submitErr, setSubmitErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLbl, setBusyLbl] = useState('')

  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)

  /* reset / prefill whenever the modal opens */
  useEffect(() => {
    if (!open) return
    setStep(startAtUpload ? 'upload' : 'intro')
    setAgreed(false); setAgreeErr(false)
    setCountry(initialCountry ?? ''); setCountryQuery(''); setCountryErr(false)
    setFront(null); setBack(null); setFrontErr(''); setBackErr('')
    setSubmitErr(''); setBusy(false); setBusyLbl('')
  }, [open, startAtUpload, initialCountry])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const pickFile = (side: 'front' | 'back', f: File | null) => {
    const setErr = side === 'front' ? setFrontErr : setBackErr
    const setDoc = side === 'front' ? setFront : setBack
    setErr('')
    if (!f) return
    if (!OK_TYPES.includes(f.type)) {
      setErr('This file type is not supported. Please upload a JPG, PNG, WebP image or PDF document.')
      return
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setErr(`The file is too large. Please upload a document smaller than ${MAX_FILE_MB} MB.`)
      return
    }
    setDoc({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })
  }

  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countryQuery.trim().toLowerCase()))

  const doSubmit = async () => {
    if (!front || !back || busy) return
    setBusy(true)
    setSubmitErr('')
    try {
      const ext = (f: File) => f.type === 'application/pdf' ? 'pdf' : f.type.split('/')[1] || 'jpg'
      const ts = Date.now()
      const frontPath = `${userId}/front-${ts}.${ext(front.file)}`
      const backPath = `${userId}/back-${ts}.${ext(back.file)}`

      setBusyLbl('Uploading front document…')
      const { error: fErr } = await supabase.storage.from('kyc-documents').upload(frontPath, front.file, { contentType: front.file.type })
      if (fErr) throw new Error('Front document upload failed: ' + fErr.message)

      setBusyLbl('Uploading back document…')
      const { error: bErr } = await supabase.storage.from('kyc-documents').upload(backPath, back.file, { contentType: back.file.type })
      if (bErr) throw new Error('Back document upload failed: ' + bErr.message)

      setBusyLbl('Submitting your verification…')
      const now = new Date().toISOString()
      const { data: existing } = await supabase.from('kyc_verifications').select('id, status').eq('user_id', userId).maybeSingle()

      if (existing) {
        /* resubmission — RLS only allows rejected → under_review */
        const { error } = await supabase.from('kyc_verifications').update({
          country, front_document_path: frontPath, back_document_path: backPath,
          status: 'under_review', submitted_at: now,
          reviewed_at: null, reviewed_by: null, rejection_reason: null, updated_at: now,
        }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('kyc_verifications').insert({
          user_id: userId, country, front_document_path: frontPath, back_document_path: backPath,
          status: 'under_review', submitted_at: now,
        })
        if (error) throw error
      }

      /* user notification (deduped per submission timestamp) */
      await pushNotification({
        userId,
        type: 'kyc_submitted',
        title: 'KYC Verification Submitted',
        message: 'Your identity documents have been successfully submitted and are currently under review. You will be notified once the review is complete.',
        actionUrl: '/profile',
        event: `kyc_submitted:${ts}`,
      })

      /* email via the existing email pipeline (fire-and-forget) */
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) return
        fetch('/api/kyc-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ event: 'submitted' }),
        }).catch(() => { /* email is best-effort */ })
      })

      setBusy(false)
      setStep('success')
      onSubmitted()
    } catch (e) {
      setBusy(false)
      setBusyLbl('')
      setSubmitErr(e instanceof Error ? e.message : 'Submission failed. Please try again.')
      setStep('upload')
    }
  }

  const uploadBox = (side: 'front' | 'back') => {
    const doc = side === 'front' ? front : back
    const err = side === 'front' ? frontErr : backErr
    const ref = side === 'front' ? frontRef : backRef
    const label = side === 'front' ? 'Front Side' : 'Back Side'
    return (
      <div className="kyc-up-block">
        <div className="kyc-up-lbl">{label}</div>
        {doc ? (
          <div className={cn('kyc-up-preview', err && 'err')}>
            {doc.preview ? (
              <img src={doc.preview} alt={`${label} preview`} />
            ) : (
              <div className="kyc-up-pdf">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span>{doc.file.name}</span>
              </div>
            )}
            <div className="kyc-up-meta">
              <span className="kyc-up-name">{doc.file.name}</span>
              <span className="kyc-up-size">{(doc.file.size / 1024 / 1024).toFixed(2)} MB · ready</span>
            </div>
            <div className="kyc-up-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => ref.current?.click()} disabled={busy}>Replace</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => (side === 'front' ? setFront(null) : setBack(null))} disabled={busy}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" className={cn('kyc-up-drop', err && 'err')} onClick={() => ref.current?.click()} disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            <span className="kyc-up-t">Upload {label}</span>
            <span className="kyc-up-s">JPG, PNG, WebP or PDF · max {MAX_FILE_MB} MB</span>
          </button>
        )}
        {err && <div className="kyc-err">{err}</div>}
        <input
          ref={ref} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: 'none' }}
          onChange={e => { pickFile(side, e.target.files?.[0] ?? null); e.target.value = '' }}
        />
      </div>
    )
  }

  return (
    <div className="modal-backdrop show" onClick={busy ? undefined : onClose}>
      <div className="modal-card kyc-card" role="dialog" aria-modal="true" aria-label="KYC verification" onClick={e => e.stopPropagation()}>

        {/* ── Step 1: intro + agreement ── */}
        {step === 'intro' && (
          <>
            <h3>Verify Your Identity</h3>
            <p className="modal-sub">
              To verify your account, we need to confirm your identity using a valid government-issued
              identity document. Please make sure the document belongs to you and that all information
              is clearly visible.
            </p>
            <label className={cn('kyc-agree', agreeErr && 'err')}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => { setAgreed(e.target.checked); if (e.target.checked) setAgreeErr(false) }}
              />
              <span>
                I agree to the KYC verification requirements and{' '}
                <a href="https://safestproxy.com/kyc-policy/" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>KYC Policy</a>.
              </span>
            </label>
            {agreeErr && <div className="kyc-err" style={{ marginTop: 8 }}>Please agree to the KYC Policy before continuing.</div>}
            <div className="modal-actions" style={{ marginTop: 22 }}>
              <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary" type="button"
                onClick={() => { if (!agreed) { setAgreeErr(true); return } setStep('country') }}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: country ── */}
        {step === 'country' && (
          <>
            <h3>Select Your Country</h3>
            <p className="modal-sub">Please select the country that issued your identity document.</p>
            <div className="form-row" style={{ marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Search country…"
                value={countryQuery}
                onChange={e => { setCountryQuery(e.target.value); setCountryErr(false) }}
                autoFocus
              />
            </div>
            <div className={cn('kyc-country-list', countryErr && 'err')}>
              {filteredCountries.length === 0 && <div className="kyc-country-empty">No country found.</div>}
              {filteredCountries.map(c => (
                <button
                  key={c} type="button"
                  className={cn('kyc-country-item', country === c && 'on')}
                  onClick={() => { setCountry(c); setCountryErr(false) }}
                >
                  {c}
                  {country === c && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </div>
            {countryErr && <div className="kyc-err" style={{ marginTop: 8 }}>Please select a country to continue.</div>}
            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setStep('intro')}>Back</button>
              <button
                className="btn btn-primary" type="button"
                onClick={() => { if (!country) { setCountryErr(true); return } setStep('upload') }}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: document upload ── */}
        {step === 'upload' && (
          <>
            <h3>Upload Your Identity Document</h3>
            <p className="modal-sub">
              Upload both sides of your {country ? `${country}-issued ` : ''}identity document.
              Make sure all details are clearly visible.
            </p>
            {uploadBox('front')}
            {uploadBox('back')}
            {submitErr && <div className="kyc-err" style={{ marginTop: 4 }}>{submitErr}</div>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              {!startAtUpload && <button className="btn btn-ghost" type="button" onClick={() => setStep('country')} disabled={busy}>Back</button>}
              <button
                className={cn('btn btn-primary', busy && 'loading')} type="button"
                disabled={!front || !back || busy}
                onClick={() => setStep('confirm')}
              >
                <span className="gen-spinner" />
                <span>{busy ? (busyLbl || 'Working…') : 'Submit Verification'}</span>
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: confirmation popup ── */}
        {step === 'confirm' && (
          <>
            <h3>Please Confirm Your Identity</h3>
            <p className="modal-sub">
              Are you sure this document is real, belongs to you, and contains your correct identity information?
            </p>
            <p className="modal-sub" style={{ marginTop: -8 }}>
              For additional verification, we may ask you to complete a face verification step if required.
            </p>
            <div className="modal-actions" style={{ marginTop: 22 }}>
              <button className="btn btn-ghost" type="button" onClick={() => setStep('upload')} disabled={busy}>Resubmit</button>
              <button className={cn('btn btn-primary', busy && 'loading')} type="button" onClick={doSubmit} disabled={busy}>
                <span className="gen-spinner" />
                <span>{busy ? (busyLbl || 'Working…') : "Yes, I'm Sure"}</span>
              </button>
            </div>
          </>
        )}

        {/* ── Step 5: success ── */}
        {step === 'success' && (
          <>
            <div className="modal-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h3>Your Documents Have Been Submitted</h3>
            <p className="modal-sub">
              Your documents have been successfully submitted and are now under review.
            </p>
            <p className="modal-sub" style={{ marginTop: -8 }}>
              Once your documents have been reviewed, you will receive an email and a notification in your account.
            </p>
            <div className="modal-actions" style={{ marginTop: 22 }}>
              <button className="btn btn-primary" type="button" onClick={onClose}>Done</button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
