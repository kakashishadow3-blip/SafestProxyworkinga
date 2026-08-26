import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/lib/toast'
import type { Profile } from '@/types'

interface Props {
  userId?: string // admin viewing another user's profile — read-only
}

export default function ProfileSection({ userId }: Props) {
  const { user, profile: ownProfile, updatePassword, refreshProfile } = useAuth()
  const readOnly = !!userId

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (readOnly && userId) {
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
        .then(({ data }) => {
          const p = data as Profile | null
          setEmail(p?.email ?? '')
          setUsername(p?.username ?? '')
        })
    } else {
      setEmail(user?.email ?? '')
      setUsername(ownProfile?.username ?? '')
    }
  }, [readOnly, userId, user, ownProfile])

  const handleUpdate = async () => {
    if (readOnly) return
    setSaving(true)
    try {
      // username → profiles table
      const newUsername = username.trim()
      if (newUsername !== (ownProfile?.username ?? '')) {
        const { error } = await supabase.from('profiles').update({ username: newUsername || null }).eq('id', user!.id)
        if (error) throw error
        await refreshProfile()
      }
      // email → auth (sends a confirmation link)
      const newEmail = email.trim()
      if (newEmail && newEmail !== user?.email) {
        const { error } = await supabase.auth.updateUser({ email: newEmail })
        if (error) throw error
        showToast('ok', 'Email confirmation sent', 'Check your new inbox to confirm the change.')
      }
      // password — synced straight into Supabase Auth
      if (pass1 || pass2) {
        if (pass1 !== pass2) {
          showToast('err', 'Passwords do not match')
          setSaving(false)
          return
        }
        if (pass1.length < 6) {
          showToast('err', 'Password must be at least 6 characters')
          setSaving(false)
          return
        }
        const { error } = await updatePassword(pass1)
        if (error) throw error
        setPass1('')
        setPass2('')
        showToast('ok', 'Password updated', 'Your new password is active immediately.')
      }
      showToast('ok', 'Profile updated', 'Your account details have been saved.')
    } catch (e) {
      showToast('err', 'Could not update profile', e instanceof Error ? e.message : undefined)
    }
    setSaving(false)
  }

  return (
    <section className="section active">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Profile</h3>
            <div className="inner-eyebrow" style={{ margin: '8px 0 0' }}>Update Profile</div>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.7, marginBottom: 24 }}>
          Keep your contact details current and protect your account with a strong password.
        </p>

        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" disabled={readOnly} />
        </div>
        <div className="form-row">
          <label>Username</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your display name" autoComplete="off" disabled={readOnly} />
        </div>
        {!readOnly && (
          <div className="field-grid">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Update Password</label>
              <input type="password" value={pass1} onChange={e => setPass1(e.target.value)} placeholder="Enter a new password" autoComplete="new-password" />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Confirm password</label>
              <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="Repeat the new password" autoComplete="new-password" />
            </div>
          </div>
        )}
        {!readOnly && (
          <div style={{ marginTop: 24 }}>
            <button className="btn btn-primary" type="button" disabled={saving} onClick={handleUpdate}>
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
