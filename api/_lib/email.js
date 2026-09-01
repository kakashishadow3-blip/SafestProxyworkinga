/* Email engine — Gmail SMTP (primary) + Brevo + Resend (fallbacks) with branded SafestProxy templates.
   sendEmail never throws: email failures must never block payments or cron. */

const FROM = process.env.EMAIL_FROM || 'SafestProxy <service@safestproxy.com>'
const APP_URL = (process.env.APP_URL || 'https://app.safestproxy.com').replace(/\/+$/, '')

function parseFrom() {
  const m = FROM.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { name: m[1], email: m[2] } : { name: 'SafestProxy', email: FROM }
}

export async function sendEmail({ to, subject, html, text }) {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return sendViaGmail({ to, subject, html, text })
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return sendViaSmtp({ to, subject, html, text })
  if (process.env.BREVO_API_KEY) return sendViaBrevo({ to, subject, html, text })
  if (process.env.RESEND_API_KEY) return sendViaResend({ to, subject, html, text })
  console.error('No email provider configured (GMAIL_USER/GMAIL_APP_PASSWORD, SMTP_*, BREVO_API_KEY, RESEND_API_KEY) — email skipped.')
  return false
}

/* Generic SMTP (cPanel / any mail server) — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS */
async function sendViaSmtp({ to, subject, html, text }) {
  try {
    const nodemailer = (await import('nodemailer')).default
    const port = Number(process.env.SMTP_PORT || 465)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || parseFrom().name + ' <' + process.env.SMTP_USER + '>',
      to,
      subject,
      html,
      text: text || '',
      replyTo: 'support@safestproxy.com',
      headers: { 'List-Unsubscribe': '<mailto:support@safestproxy.com>' },
    })
    return true
  } catch (e) {
    console.error('SMTP send failed:', e && e.message ? e.message : e)
    return false
  }
}

async function sendViaGmail({ to, subject, html, text }) {
  try {
    const nodemailer = (await import('nodemailer')).default
    const sender = parseFrom()
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })
    await transporter.sendMail({
      // EMAIL_FROM env var can override the sender (e.g. a verified "Send mail as" alias like service@safestproxy.com)
      from: process.env.EMAIL_FROM || `${sender.name} <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || '',
      replyTo: 'support@safestproxy.com',
      headers: { 'List-Unsubscribe': '<mailto:support@safestproxy.com>' },
    })
    return true
  } catch (e) {
    console.error('Gmail SMTP send failed:', e && e.message ? e.message : e)
    return false
  }
}

async function sendViaBrevo({ to, subject, html, text }) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' },
      body: JSON.stringify({
        sender: parseFrom(),
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || '',
        headers: { 'List-Unsubscribe': '<mailto:support@safestproxy.com>' },
        tags: ['transactional'],
      }),
    })
    if (!res.ok) {
      console.error('Brevo error:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('Brevo send failed:', e && e.message ? e.message : e)
    return false
  }
}

async function sendViaResend({ to, subject, html, text }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html,
        text: text || '',
        headers: { 'List-Unsubscribe': '<mailto:support@safestproxy.com>' },
      }),
    })
    if (!res.ok) {
      console.error('Resend error:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('Resend send failed:', e && e.message ? e.message : e)
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
      SafestProxy · <a href="${APP_URL}" style="color:#0EA5B7;text-decoration:none;">app.safestproxy.com</a> · <a href="mailto:support@safestproxy.com" style="color:#0EA5B7;text-decoration:none;">support@safestproxy.com</a>
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
      'Your invoice is available anytime in the Billing section. Questions? Contact support@safestproxy.com.',
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
      footer: 'Your invoice is available anytime in the Billing section of your dashboard. Questions? Reply to this email or contact support@safestproxy.com.',
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
      footer: 'Need an extension or a custom plan? Contact support@safestproxy.com — we are happy to help.',
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
      footer: 'Running heavy workloads? Ask support@safestproxy.com about higher-volume plans.',
    }),
  }
}

/* ── 3b. bandwidth almost used (low-data heads-up) ──────────────── */

export function lowDataEmail({ name, planName, remainingGb, limitGb }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'Your SafestProxy data is almost used',
    html: layout({
      eyebrow: 'Low data warning',
      title: 'Your data is about to run out',
      intro: hi + ' your plan\'s remaining traffic has dropped to the low-data threshold. To avoid any interruption of your proxy service, we recommend upgrading your plan or adding more data now — it reactivates automatically after payment.',
      rows: [
        ['Plan', planName],
        ['Data remaining', gb(remainingGb) + ' of ' + gb(limitGb)],
      ],
      ctaLabel: 'Add More Data',
      ctaUrl: APP_URL + '/plans',
      footer: 'Questions about usage? Contact support@safestproxy.com — we are happy to help.',
    }),
  }
}

/* ── 4. KYC verification submitted ──────────────────────────────── */

export function kycSubmittedEmail({ name }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'KYC verification submitted — under review',
    text: [
      hi, '',
      'Your identity documents have been successfully submitted and are currently under review.',
      'Once your documents have been reviewed, you will receive an email and a notification in your account.', '',
      'Open your dashboard: ' + APP_URL, '',
      'You received this email because you have an account at SafestProxy (app.safestproxy.com). This is a service notification about your account, not marketing mail.',
    ].join('\n'),
    html: layout({
      eyebrow: 'KYC verification',
      title: 'Documents submitted',
      intro: hi + ' your identity documents have been successfully submitted and are currently under review. Once reviewed, you will receive an email and a notification in your account.',
      rows: [['Status', 'Under review']],
      ctaLabel: 'Open Dashboard',
      ctaUrl: APP_URL + '/profile',
      footer: 'Reviews are usually completed quickly. Questions? Contact support@safestproxy.com.',
    }),
  }
}

/* ── 5. KYC verification approved ───────────────────────────────── */

export function kycApprovedEmail({ name }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'Your KYC verification has been approved',
    text: [
      hi, '',
      'Your identity verification has been successfully approved. Your account is now verified.', '',
      'Open your dashboard: ' + APP_URL, '',
      'You received this email because you have an account at SafestProxy (app.safestproxy.com). This is a service notification about your account, not marketing mail.',
    ].join('\n'),
    html: layout({
      eyebrow: 'KYC verification',
      title: 'Identity verified',
      intro: hi + ' your identity verification has been successfully approved. Your account is now fully verified.',
      rows: [['Status', 'Verified']],
      ctaLabel: 'Open Dashboard',
      ctaUrl: APP_URL + '/profile',
      footer: 'Thank you for completing verification. Questions? Contact support@safestproxy.com.',
    }),
  }
}

/* ── 6. KYC verification rejected ───────────────────────────────── */

export function kycRejectedEmail({ name, reason }) {
  const hi = name ? 'Hi ' + name + ',' : 'Hi there,'
  return {
    subject: 'Your KYC verification could not be approved',
    text: [
      hi, '',
      'Your identity verification could not be approved. Please review the reason below and resubmit your documents.', '',
      'Reason: ' + (reason || 'Document could not be verified.'), '',
      'Resubmit from your profile: ' + APP_URL + '/profile', '',
      'You received this email because you have an account at SafestProxy (app.safestproxy.com). This is a service notification about your account, not marketing mail.',
    ].join('\n'),
    html: layout({
      eyebrow: 'KYC verification',
      title: 'Verification rejected',
      intro: hi + ' your identity verification could not be approved. Please review the reason below and resubmit your documents from your profile.',
      rows: [['Status', 'Rejected'], ['Reason', reason || 'Document could not be verified.']],
      ctaLabel: 'Resubmit Documents',
      ctaUrl: APP_URL + '/profile',
      footer: 'Make sure your document is valid, clearly visible and belongs to you. Questions? Contact support@safestproxy.com.',
    }),
  }
}
