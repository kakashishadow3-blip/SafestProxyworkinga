import { cryptomusRequest } from './_lib/cryptomus.js'
import { requireUser } from './_lib/admin.js'
import { activateOrder } from './_lib/activate.js'

/* GET|POST /api/payment-status?order_id=...
   Called by the dashboard when the user returns from Cryptomus checkout.
   Checks Cryptomus directly; if the payment is final-success, activates the order
   (idempotent — the webhook may have already done it). */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const ctx = await requireUser(req)
    if (!ctx) return res.status(401).json({ error: 'You must be signed in.' })
    const { admin, user } = ctx

    const orderId = req.method === 'POST' ? (req.body || {}).order_id : req.query.order_id
    if (!orderId) return res.status(400).json({ error: 'order_id is required.' })

    const { data: order } = await admin.from('orders').select('*')
      .eq('id', orderId).eq('user_id', user.id).maybeSingle()
    if (!order) return res.status(404).json({ error: 'Order not found.' })

    if (order.status === 'paid' || order.status === 'active') {
      return res.status(200).json({ status: 'paid' })
    }

    const info = await cryptomusRequest('/payment/info', { order_id: orderId })
    const st = info && info.status ? info.status : 'pending'

    if (st === 'paid' || st === 'paid_over') {
      await activateOrder(admin, orderId, info.uuid)
      return res.status(200).json({ status: 'paid' })
    }
    return res.status(200).json({ status: st })
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Status check failed.' })
  }
}
