import { sendEmail, purchaseEmail } from './email.js'

/* Idempotent order activation — mirrors the admin "Approve top-up" flow.
   Safe to call multiple times (webhook retries + status polling). */
export async function activateOrder(admin, orderId, cryptomusUuid) {
  const { data: order, error } = await admin
    .from('orders').select('*, plans(*)').eq('id', orderId).maybeSingle()
  if (error || !order) throw new Error('Order not found: ' + orderId)

  if (order.status === 'paid' || order.status === 'active') {
    return { already: true, order }
  }

  const plan = order.plans
  const start = new Date()
  const expiry = new Date(start.getTime() + (plan && plan.duration_days ? plan.duration_days : 30) * 86400000)

  /* 1. mark the order paid + store the Cryptomus payment uuid */
  const { error: oErr } = await admin.from('orders')
    .update({ status: 'paid', cryptomus_order_id: cryptomusUuid || order.cryptomus_order_id })
    .eq('id', orderId)
  if (oErr) throw oErr

  /* 2. expire any currently-active subscription */
  await admin.from('subscriptions').update({ status: 'expired' })
    .eq('user_id', order.user_id).eq('status', 'active')

  /* 3. activate the new subscription */
  const { error: sErr } = await admin.from('subscriptions').insert({
    user_id: order.user_id,
    plan_id: order.plan_id,
    status: 'active',
    bandwidth_used_gb: 0,
    bandwidth_limit_gb: plan ? plan.bandwidth_gb : 0,
    start_date: start.toISOString(),
    expiry_date: expiry.toISOString(),
  })
  if (sErr) throw sErr

  /* 4. ensure proxy credentials exist (auto-generate on first purchase) */
  const { data: cred } = await admin.from('proxy_credentials')
    .select('id').eq('user_id', order.user_id).limit(1)
  if (!cred || cred.length === 0) {
    const un = 'u' + Math.random().toString(36).slice(2, 12)
    const pw = Math.random().toString(36).slice(2, 14)
    await admin.from('proxy_credentials').insert({
      user_id: order.user_id,
      dataimpulse_username: un,
      dataimpulse_password: pw,
      host: 'gate.safestproxy.com',
      port: 7777,
      status: 'active',
    })
  }

  /* 5. best-effort audit trail (never blocks activation) */
  try {
    await admin.from('audit_logs').insert({
      admin_user_id: order.user_id,
      target_user_id: order.user_id,
      action: 'payment_auto_confirmed',
      entity_type: 'order',
      entity_id: orderId,
      old_value: 'status: ' + order.status,
      new_value: 'status: paid · subscription activated',
      reason: 'Cryptomus payment ' + (cryptomusUuid || '') + ' · ' + (plan ? plan.name : 'plan') + ' · $' + Number(order.amount).toFixed(2),
    })
  } catch (_) { /* audit is optional */ }

  /* 6. purchase confirmation email (best-effort, never blocks) */
  try {
    const { data: prof } = await admin.from('profiles')
      .select('email, username').eq('id', order.user_id).maybeSingle()
    if (prof && prof.email) {
      const mail = purchaseEmail({
        name: prof.username || prof.email.split('@')[0],
        planName: plan ? plan.name : 'Proxy plan',
        price: order.amount,
        bandwidthGb: plan ? plan.bandwidth_gb : 0,
        expiryDate: expiry.toISOString(),
        orderId,
      })
      await sendEmail({ to: prof.email, subject: mail.subject, html: mail.html })
    }
  } catch (_) { /* email is optional */ }

  return { already: false, order }
}
