import { requireUser } from './_lib/admin.js'
import { sendEmail, expiredEmail, exhaustedEmail, lowDataEmail } from './_lib/email.js'

/* POST /api/plan-event-email  { subscription_id }
   Admin-only. Fires the instant notification + email for whatever state the
   subscription is CURRENTLY in (the database is the source of truth):
     status 'expired'                    → Plan Expired email + notification
     active, remaining <= 0              → Data Fully Used email + notification
     active, remaining <= 2 GB (config)  → Low Data email + notification
   Called by the admin panel right after a manual expire/usage edit, so the
   user is informed immediately instead of waiting for the hourly cron.
   Fully idempotent: per-subscription sent-flags + the unique notification
   event index guarantee no duplicates, no matter how often this runs. */

const LOW_DATA_THRESHOLD_GB = 2   // must match check-expirations.js

async function notify(admin, { userId, type, title, message, actionUrl, event }) {
  try {
    await admin.from('notifications').insert({
      user_id: userId, type, title, message,
      action_url: actionUrl || null,
      metadata: event ? { event } : {},
    })
  } catch { /* duplicate event — the unique index already notified it */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const ctx = await requireUser(req)
    if (!ctx) return res.status(401).json({ error: 'You must be signed in.' })
    const { admin, user } = ctx

    /* admin-only */
    const { data: caller } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    if (!caller?.is_admin) return res.status(403).json({ error: 'Admins only.' })

    const { subscription_id } = req.body || {}
    if (!subscription_id) return res.status(400).json({ error: 'subscription_id is required.' })

    const { data: sub } = await admin.from('subscriptions')
      .select('*, plans(*), profiles(email, username)')
      .eq('id', subscription_id)
      .maybeSingle()
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' })

    const now = new Date().toISOString()
    const planName = sub.plans ? sub.plans.name : 'proxy'
    const email = sub.profiles && sub.profiles.email
    const name = sub.profiles ? (sub.profiles.username || (sub.profiles.email || '').split('@')[0]) : ''
    const used = Number(sub.bandwidth_used_gb) || 0
    const limit = Number(sub.bandwidth_limit_gb) || 0
    const remaining = limit - used
    const out = { ok: true, event: null, emailed: false }

    if (sub.status === 'expired') {
      /* ── plan expired (manual or natural) ── */
      out.event = 'expired'
      await notify(admin, {
        userId: sub.user_id, type: 'plan_expired', title: 'Plan Expired',
        message: `Your ${planName} plan has expired. Please upgrade your plan to continue using our services.`,
        actionUrl: '/plans', event: `expired:${sub.id}`,
      })
      if (email && !sub.expiry_email_sent_at) {
        const mail = expiredEmail({ name, planName, expiryDate: sub.expiry_date })
        if (await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text })) {
          await admin.from('subscriptions').update({ expiry_email_sent_at: now }).eq('id', sub.id)
          out.emailed = true
        }
      }
    } else if (sub.status === 'active' && limit > 0 && remaining <= 0) {
      /* ── data fully used ── */
      out.event = 'exhausted'
      await notify(admin, {
        userId: sub.user_id, type: 'data_exhausted', title: 'Your Data Has Been Fully Used',
        message: `Your ${planName} plan's data has been fully used. Please upgrade your plan or add more data to continue using the service.`,
        actionUrl: '/plans', event: `exhausted:${sub.id}`,
      })
      if (email && !sub.exhausted_email_sent_at) {
        const mail = exhaustedEmail({ name, planName, limitGb: limit })
        if (await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text })) {
          await admin.from('subscriptions').update({ exhausted_email_sent_at: now }).eq('id', sub.id)
          out.emailed = true
        }
      }
    } else if (sub.status === 'active' && limit > 0 && remaining <= LOW_DATA_THRESHOLD_GB) {
      /* ── low data ── */
      out.event = 'low_data'
      await notify(admin, {
        userId: sub.user_id, type: 'low_data', title: 'Your Data Is Almost Used',
        message: `Only ${remaining.toFixed(2)} GB is left on your ${planName} plan. Your remaining data is almost at its limit — please upgrade your plan or add more data before your data runs out to avoid interruption of your proxy service.`,
        actionUrl: '/plans', event: `lowdata:${sub.id}`,
      })
      if (email && !sub.low_data_email_sent_at) {
        const mail = lowDataEmail({ name, planName, remainingGb: remaining, limitGb: limit })
        if (await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text })) {
          await admin.from('subscriptions').update({ low_data_email_sent_at: now }).eq('id', sub.id)
          out.emailed = true
        }
      }
    }

    return res.status(200).json(out)
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Could not process plan event.' })
  }
}
