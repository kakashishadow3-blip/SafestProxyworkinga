import { cryptomusRequest } from './_lib/cryptomus.js'
import { requireUser } from './_lib/admin.js'

/* POST /api/create-payment
   Body: { plan_id }          → create a new order + Cryptomus invoice
         { order_id }         → resume payment for an existing unpaid order
   Returns: { url, order_id } — redirect the user to `url` (Cryptomus checkout). */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const ctx = await requireUser(req)
    if (!ctx) return res.status(401).json({ error: 'You must be signed in to pay.' })
    const { admin, user } = ctx

    const body = req.body || {}
    const planId = body.plan_id
    const orderId = body.order_id

    let order = null

    if (orderId) {
      const { data } = await admin.from('orders').select('*, plans(*)')
        .eq('id', orderId).eq('user_id', user.id).maybeSingle()
      if (!data) return res.status(404).json({ error: 'Order not found.' })
      if (data.status === 'paid' || data.status === 'active') {
        return res.status(400).json({ error: 'This order is already paid.' })
      }
      order = data
    } else {
      if (!planId) return res.status(400).json({ error: 'plan_id is required.' })
      const { data: plan } = await admin.from('plans').select('*').eq('id', planId).maybeSingle()
      if (!plan) return res.status(404).json({ error: 'Plan not found.' })
      if (plan.is_active === false) return res.status(400).json({ error: 'This plan is currently unavailable.' })

      /* reuse a still-unpaid order for the same plan when the price is unchanged */
      const { data: existing } = await admin.from('orders').select('*, plans(*)')
        .eq('user_id', user.id).eq('plan_id', planId)
        .in('status', ['pending', 'awaiting_topup'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (existing && Number(existing.amount) === Number(plan.price)) {
        order = existing
      } else {
        const { data: created, error: cErr } = await admin.from('orders')
          .insert({ user_id: user.id, plan_id: plan.id, amount: plan.price, status: 'pending' })
          .select('*, plans(*)').single()
        if (cErr) throw cErr
        order = created
      }
    }

    const appUrl = (process.env.APP_URL || 'https://app.safestproxy.com').replace(/\/+$/, '')
    const amount = Number(order.amount).toFixed(2)

    const result = await cryptomusRequest('/payment', {
      amount,
      currency: 'USD',
      order_id: order.id,
      url_return: appUrl + '/billing',
      url_success: appUrl + '/billing?payment=success&order_id=' + order.id,
      url_callback: appUrl + '/api/cryptomus-webhook',
      is_payment_multiple: false,
      lifetime: '3600',
    })

    if (result && result.uuid) {
      await admin.from('orders').update({ cryptomus_order_id: result.uuid }).eq('id', order.id)
    }
    if (!result || !result.url) throw new Error('Cryptomus did not return a payment URL.')

    return res.status(200).json({ url: result.url, order_id: order.id })
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Could not create payment.' })
  }
}
