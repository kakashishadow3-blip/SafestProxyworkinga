import { getAdminClient } from './_lib/admin.js'
import { sendEmail, expiredEmail, exhaustedEmail } from './_lib/email.js'

/* GET /api/check-expirations — called daily by Vercel Cron.
   1. Active subscriptions past their expiry date → mark expired + "plan expired" email + notification
   2. Active subscriptions with bandwidth fully used → "data finished" email (once) + notification
   3. Active subscriptions with <= LOW_DATA_THRESHOLD_GB remaining → low-data notification (once)
   Protected by CRON_SECRET (Vercel sends it automatically in the Authorization header). */

const LOW_DATA_THRESHOLD_GB = 2   // configurable low-data alert threshold

/* Insert a dashboard notification; the unique (user,type,event) index swallows duplicates. */
async function notify(admin, { userId, type, title, message, actionUrl, event }) {
  try {
    await admin.from('notifications').insert({
      user_id: userId, type, title, message,
      action_url: actionUrl || null,
      metadata: event ? { event } : {},
    })
  } catch { /* duplicate or transient — safe to ignore */ }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const header = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!secret || header !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const admin = getAdminClient()
  const now = new Date().toISOString()
  const result = { expired: 0, expiredEmailed: 0, exhaustedEmailed: 0, errors: 0 }

  /* ── 1. expire overdue subscriptions ─────────────────────────── */
  const { data: overdue } = await admin.from('subscriptions')
    .select('*, plans(*), profiles(email, username)')
    .eq('status', 'active')
    .not('expiry_date', 'is', null)
    .lt('expiry_date', now)

  for (const sub of overdue || []) {
    try {
      await admin.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id)
      result.expired += 1
      await notify(admin, {
        userId: sub.user_id,
        type: 'plan_expired',
        title: 'Plan Expired',
        message: `Your ${sub.plans ? sub.plans.name : 'proxy'} plan has expired. Please upgrade your plan to continue using our services.`,
        actionUrl: '/plans',
        event: `expired:${sub.id}`,
      })
      if (!sub.expiry_email_sent_at && sub.profiles && sub.profiles.email) {
        const mail = expiredEmail({
          name: sub.profiles.username || sub.profiles.email.split('@')[0],
          planName: sub.plans ? sub.plans.name : 'Proxy plan',
          expiryDate: sub.expiry_date,
        })
        const ok = await sendEmail({ to: sub.profiles.email, subject: mail.subject, html: mail.html, text: mail.text })
        if (ok) {
          await admin.from('subscriptions').update({ expiry_email_sent_at: now }).eq('id', sub.id)
          result.expiredEmailed += 1
        }
      }
    } catch (e) {
      result.errors += 1
      console.error('expire failed for', sub.id, e)
    }
  }

  /* ── 2. bandwidth exhausted (one-time email per subscription) ── */
  const { data: actives } = await admin.from('subscriptions')
    .select('*, plans(*), profiles(email, username)')
    .eq('status', 'active')
    .gt('bandwidth_limit_gb', 0)
    .is('exhausted_email_sent_at', null)

  for (const sub of actives || []) {
    try {
      const used = Number(sub.bandwidth_used_gb) || 0
      const limit = Number(sub.bandwidth_limit_gb) || 0
      if (limit <= 0) continue

      /* low-data heads-up (once per subscription) */
      const remaining = limit - used
      if (remaining > 0 && remaining <= LOW_DATA_THRESHOLD_GB) {
        await notify(admin, {
          userId: sub.user_id,
          type: 'low_data',
          title: 'Your Data Is Almost Used',
          message: `Only ${remaining.toFixed(2)} GB is left on your ${sub.plans ? sub.plans.name : 'proxy'} plan. Your data may run out soon — please upgrade your plan or add more data before it runs out.`,
          actionUrl: '/plans',
          event: `lowdata:${sub.id}`,
        })
      }

      if (used < limit) continue
      await notify(admin, {
        userId: sub.user_id,
        type: 'data_exhausted',
        title: 'Data Finished',
        message: `Your ${sub.plans ? sub.plans.name : 'proxy'} plan's data is fully used. Upgrade your plan or add more data to continue.`,
        actionUrl: '/plans',
        event: `exhausted:${sub.id}`,
      })
      if (!sub.profiles || !sub.profiles.email) continue
      const mail = exhaustedEmail({
        name: sub.profiles.username || sub.profiles.email.split('@')[0],
        planName: sub.plans ? sub.plans.name : 'Proxy plan',
        limitGb: limit,
      })
      const ok = await sendEmail({ to: sub.profiles.email, subject: mail.subject, html: mail.html, text: mail.text })
      if (ok) {
        await admin.from('subscriptions').update({ exhausted_email_sent_at: now }).eq('id', sub.id)
        result.exhaustedEmailed += 1
      }
    } catch (e) {
      result.errors += 1
      console.error('exhausted check failed for', sub.id, e)
    }
  }

  return res.status(200).json({ ok: true, ...result })
}
