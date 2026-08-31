import { requireUser } from './_lib/admin.js'
import { sendEmail, kycSubmittedEmail, kycApprovedEmail, kycRejectedEmail } from './_lib/email.js'

/* POST /api/kyc-email
   { event: 'submitted' }                          → email the signed-in user (their own submission)
   { event: 'approved'|'rejected', user_id, reason } → admin only; email the target user
   Email failures never block the main flow — the caller treats this as fire-and-forget. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const ctx = await requireUser(req)
    if (!ctx) return res.status(401).json({ error: 'You must be signed in.' })
    const { admin, user } = ctx
    const { event, user_id: targetId, reason } = req.body || {}

    let targetUserId = user.id
    if (event === 'approved' || event === 'rejected') {
      const { data: caller } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      if (!caller?.is_admin) return res.status(403).json({ error: 'Admins only.' })
      if (!targetId) return res.status(400).json({ error: 'user_id is required.' })
      targetUserId = targetId
    } else if (event !== 'submitted') {
      return res.status(400).json({ error: 'Unknown event.' })
    }

    const { data: prof } = await admin.from('profiles').select('email, username').eq('id', targetUserId).maybeSingle()
    if (!prof?.email) return res.status(404).json({ error: 'User not found.' })

    const name = prof.username || prof.email.split('@')[0]
    const mail = event === 'submitted' ? kycSubmittedEmail({ name })
      : event === 'approved' ? kycApprovedEmail({ name })
        : kycRejectedEmail({ name, reason })

    const ok = await sendEmail({ to: prof.email, subject: mail.subject, html: mail.html, text: mail.text })
    return res.status(200).json({ ok })
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Could not send email.' })
  }
}
