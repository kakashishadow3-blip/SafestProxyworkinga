import crypto from 'node:crypto'

const API_BASE = 'https://api.cryptomus.com/v1'

/* Cryptomus signature: md5( base64( JSON.stringify(data) ) + apiKey ) */
export function cryptomusSign(data, apiKey) {
  const b64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
  return crypto.createHash('md5').update(b64 + apiKey, 'utf8').digest('hex')
}

/* Authenticated call to the Cryptomus API. Returns `result` on success, throws otherwise. */
export async function cryptomusRequest(path, data) {
  const merchant = process.env.CRYPTOMUS_MERCHANT_ID
  const apiKey = process.env.CRYPTOMUS_API_KEY
  if (!merchant || !apiKey) throw new Error('Cryptomus is not configured on the server.')
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      merchant,
      sign: cryptomusSign(data, apiKey),
    },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => null)
  if (!json) throw new Error('Empty response from Cryptomus.')
  if (json.state !== 0) {
    const msg = json.message || (json.errors ? JSON.stringify(json.errors) : 'Cryptomus request failed.')
    throw new Error(msg)
  }
  return json.result
}
