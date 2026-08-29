import { cryptomusSign } from './_lib/cryptomus.js'
import { getAdminClient } from './_lib/admin.js'
import { activateOrder } from './_lib/activate.js'

/* POST /api/cryptomus-webhook — called by Cryptomus when a payment changes state.
   Verifies the signature, then activates the order on final success statuses. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const data = req.body || {}
    const sign = data.sign
    const apiKey = process.env.CRYPTOMUS_API_KEY
    if (!sign || !apiKey) return res.status(400).json({ error: 'Missing signature.' })

    const payload = { ...data }
    delete payload.sign
    const expected = cryptomusSign(payload, apiKey)
    if (expected !== sign) return res.status(403).json({ error: 'Invalid signature.' })

    if (data.status === 'paid' || data.status === 'paid_over') {
      const admin = getAdminClient()
      await activateOrder(admin, data.order_id, data.uuid)
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Webhook error.' })
  }
}
