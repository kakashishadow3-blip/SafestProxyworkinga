/* Email engine — Resend API + branded SafestProxy templates.
   sendEmail never throws: email failures must never block payments or cron. */

const FROM = process.env.EMAIL_FROM || 'SafestProxy <service@safestproxy.com>'
const APP_URL = (process.env.APP_URL || 'https://app.safestproxy.com').replace(/\/+$/, '')

export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.error('RESEND_API_KEY is not configured — email skipped.') ; return false }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
        text: text || '',
        headers: { 'List-Unsubscribe': '<mailto:service@safestproxy.com>' },
      }),
    })
    if (!res.ok) {
      console.error('Resend error:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('Email send failed:', e && e.message ? e.message : e)
    return false
  }
}

/* ── shared layout ─────────────────────────────────────────────── */

function layout({ eyebrow, title, intro, rows, ctaLabel, ctaUrl, footer }) {
  const rowHtml = (rows || []).map(r => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #EEF0F5;color:#6B7280;font-size:13px;">${r[0]}</td>
      <td style="padding:10px 0;border-bottom:1px solid #EEF0F5;color:#14161D;font-size:13px;font-weight:600;text-align:right;">${r[1]}</td>
    </tr>`).join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F8;font-family:Inter,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#0D0F14;border-radius:16px 16px 0 0;padding:26px 32px;">
      <div style="color:#FFFFFF;font-size:20px;font-weight:800;letter-spacing:-.02em;">SafestProxy</div>
      <div style="color:#8A91A3;font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-top:4px;">${eyebrow}</div>
    </div>
    <div style="background:#FFFFFF;padding:32px;border-radius:0 0 16px 16px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#14161D;letter-spacing:-.02em;">${title}</h1>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#4B5265;">${intro}</p>
      ${rows && rows.length ? `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${rowHtml}</table>` : ''}
      ${ctaLabel ? `<a href="${ctaUrl}" style="display:inline-block;background:#0D0F14;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;">${ctaLabel}</a>` : ''}
      <p style="margin:26px 0 0;font-size:12.5px;line-height:1.6;color:#9AA1B2;">${footer}</p>
      <p style="margin:14px 0 0;font-size:11.5px;line-height:1.6;color:#B6BCC9;">You received this email because you have an account at SafestProxy (app.safestproxy.com). This is a service notification about your subscription, not marketing mail.</p>
    </div>
    <div style="text-align:center;padding:22px 0;font-size:11.5px;color:#9AA1B2;">
      SafestProxy · <a href="${APP_URL}" style="color:#0EA5B7;text-decoration:none;">app.safestproxy.com</a> · <a href="mailto:service@safestproxy.com" style="color:#0EA5B7;text-decoration:none;">service@safestproxy.com</a>
    </div>
  </div>
</body></html>`
}

const money = n => '$' + Number(n).toFixed(2)
const fdate = iso => { try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } catch { return iso } }
const gb = n => Number(n) >= 1000 ? (Number(n) / 1000) + ' TB' : Number(n) + ' GB'

/* ── 1. purchase confirmed + plan active ────────────────────────── */

export function purchaseEmail({ name, planName, price, bandwidthGb, expiryDate, orderId }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'Your SafestProxy plan is active — ' + planName,
    text: [
      hi,
      '',
      'Your payment has been confirmed and your subscription was activated automatically. You can start generating proxies right away from your dashboard.',
      '',
      'Plan: ' + planName,
      'Traffic allowance: ' + (bandwidthGb > 0 ? gb(bandwidthGb) : 'Unlimited'),
      'Amount paid: ' + money(price),
      'Valid until: ' + fdate(expiryDate),
      'Order ID: #' + String(orderId).replace(/-/g, '').slice(0, 8).toUpperCase(),
      '',
      'Open your dashboard: ' + APP_URL,
      '',
      'Your invoice is available anytime in the Billing section. Questions? Contact service@safestproxy.com.',
      '',
      'You received this email because you have an account at SafestProxy (app.safestproxy.com). This is a service notification about your subscription, not marketing mail.',
    ].join('\n'),
    html: layout({
      eyebrow: 'Payment confirmed',
      title: 'Your plan is now active',
      intro: hi + ' your payment has been confirmed and your subscription was activated automatically. You can start generating proxies right away from your dashboard.',
      rows: [
        ['Plan', planName],
        ['Traffic allowance', bandwidthGb > 0 ? gb(bandwidthGb) : 'Unlimited'],
        ['Amount paid', money(price)],
        ['Valid until', fdate(expiryDate)],
        ['Order ID', '#' + String(orderId).replace(/-/g, '').slice(0, 8).toUpperCase()],
      ],
      ctaLabel: 'Open Dashboard',
      ctaUrl: APP_URL,
      footer: 'Your invoice is available anytime in the Billing section of your dashboard. Questions? Reply to this email or contact service@safestproxy.com.',
    }),
  }
}

/* ── 2. plan expired (days completed) ───────────────────────────── */

export function expiredEmail({ name, planName, expiryDate }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'Your SafestProxy plan has expired',
    html: layout({
      eyebrow: 'Plan expired',
      title: 'Your plan period has ended',
      intro: hi + ' the billing period of your plan has completed and your subscription is now expired. Proxy generation has been paused on your account. Renew or upgrade anytime to restore access instantly.',
      rows: [
        ['Plan', planName],
        ['Expired on', fdate(expiryDate)],
      ],
      ctaLabel: 'Renew Plan',
      ctaUrl: APP_URL + '/plans',
      footer: 'Need an extension or a custom plan? Contact service@safestproxy.com — we are happy to help.',
    }),
  }
}

/* ── 3. bandwidth fully used ────────────────────────────────────── */

export function exhaustedEmail({ name, planName, limitGb }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'Your SafestProxy bandwidth is fully used',
    html: layout({
      eyebrow: 'Data limit reached',
      title: 'You have used all your data',
      intro: hi + ' your plan\'s traffic allowance has been fully consumed. Proxy generation is paused until you upgrade or renew — it only takes a minute and reactivates automatically after payment.',
      rows: [
        ['Plan', planName],
        ['Data used', gb(limitGb) + ' (100%)'],
      ],
      ctaLabel: 'Upgrade Plan',
      ctaUrl: APP_URL + '/plans',
      footer: 'Running heavy workloads? Ask service@safestproxy.com about higher-volume plans.',
    }),
  }
}
