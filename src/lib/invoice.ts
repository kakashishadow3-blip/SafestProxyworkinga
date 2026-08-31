import jsPDF from 'jspdf'
import { fmtDate } from './utils'
import { productOf, PRODUCT_META, tierLong, threadsOf, periodOf } from './plans'
import type { Order, Plan } from '@/types'

/* Invoice status derived from the order row (backend-owned) */
export const INV_STATUS: Record<string, [string, string]> = {
  paid: ['PAID', 'ok'],
  active: ['PAID', 'ok'],
  pending: ['PENDING', 'warn'],
  awaiting_topup: ['PENDING', 'warn'],
  cancelled: ['FAILED', 'bad'],
}

export interface Invoice {
  num: string
  plan: string
  ptype: string
  allowance: string
  cycle: string
  period: string
  amount: number
  status: string
  date: string
  payMethod: string
  txn: string
}

export interface InvoiceCustomer {
  name: string
  email: string
  username: string
}

/* Build display-ready invoice rows from raw order rows */
export function invoicesFromOrders(orders: Order[]): Invoice[] {
  return orders.map(o => {
    const p = o.plans
    const product = p ? productOf(p.name) : 'residential'
    const unlimited = product === 'unlimited_residential'
    const created = new Date(o.created_at)
    const end = p ? new Date(created.getTime() + p.duration_days * 86400000) : created
    const asPlan = p as Plan | null
    const uPeriod = asPlan ? periodOf(asPlan) : null
    const cycleLabel = uPeriod === 'day' ? 'Daily' : uPeriod === 'week' ? 'Weekly' : 'Monthly'
    return {
      num: 'SP-' + o.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      plan: p?.name ?? 'Plan',
      ptype: PRODUCT_META[product].name,
      allowance: p ? (unlimited ? `${threadsOf(asPlan!)} threads` : tierLong(p.bandwidth_gb)) : '—',
      cycle: p ? cycleLabel : '—',
      period: p ? `${fmtDate(created)} – ${fmtDate(end)}` : fmtDate(created),
      amount: Number(o.amount),
      status: o.status,
      date: fmtDate(created),
      payMethod: 'Cryptocurrency',
      txn: o.cryptomus_order_id ?? '—',
    }
  })
}

/* Render + save the invoice PDF. Throws on failure — caller handles UI state. */
export function generateInvoicePdf(inv: Invoice, customer: InvoiceCustomer): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const PW = 210, M = 18, CW = PW - M * 2
  const BLUE: [number, number, number] = [67, 97, 238]
  const INK: [number, number, number] = [24, 28, 42]
  const DIM: [number, number, number] = [110, 116, 139]
  const LINE: [number, number, number] = [228, 231, 240]
  const money = (n: number) => '$' + n.toFixed(2)
  let y = 24

  /* header */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...BLUE)
  doc.text('SafestProxy', M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DIM)
  doc.text('Proxy Infrastructure & Network Services', M, y + 5.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK)
  doc.text('INVOICE', PW - M, y - 2, { align: 'right' })
  doc.setFontSize(10.5); doc.setTextColor(...BLUE)
  doc.text('#' + inv.num, PW - M, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DIM)
  doc.text(inv.date, PW - M, y + 9.5, { align: 'right' })
  y += 16
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(M, y, PW - M, y)
  y += 9

  /* billed to / status */
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DIM)
  doc.text('BILLED TO', M, y)
  doc.text('PAYMENT STATUS', PW - M, y, { align: 'right' })
  y += 5.5
  doc.setFontSize(11); doc.setTextColor(...INK)
  doc.text(customer.name, M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...DIM)
  doc.text(customer.email, M, y + 5)
  doc.text('Username: ' + customer.username, M, y + 10)
  const [stLbl] = INV_STATUS[inv.status] ?? ['PENDING', 'warn']
  const stCol: [[number, number, number], [number, number, number]] =
    inv.status === 'paid' || inv.status === 'active' ? [[21, 128, 61], [220, 252, 231]]
      : inv.status === 'cancelled' ? [[185, 28, 28], [254, 226, 226]]
        : [[180, 83, 9], [254, 243, 199]]
  const stW = doc.getTextWidth(stLbl) + 12
  doc.setFillColor(...stCol[1])
  doc.roundedRect(PW - M - stW, y - 4.5, stW, 8, 2, 2, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...stCol[0])
  doc.text(stLbl, PW - M - stW / 2, y + 0.8, { align: 'center' })
  y += 18

  /* plan details */
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DIM)
  doc.text('PLAN DETAILS', M, y)
  y += 4
  const cells: [string, string][] = [['Plan', inv.plan], ['Proxy type', inv.ptype], ['Data allowance', inv.allowance], ['Subscription', inv.cycle]]
  const cw = (CW - 9) / 2, ch = 15
  cells.forEach((c, ci) => {
    const cx = M + (ci % 2) * (cw + 9), cy = y + Math.floor(ci / 2) * (ch + 4)
    doc.setFillColor(246, 247, 251); doc.setDrawColor(...LINE)
    doc.roundedRect(cx, cy, cw, ch, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DIM)
    doc.text(c[0].toUpperCase(), cx + 4, cy + 5.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
    doc.text(c[1], cx + 4, cy + 11.5)
  })
  y += ch * 2 + 4 + 10

  /* line items */
  doc.setFillColor(...BLUE)
  doc.rect(M, y, CW, 8.5, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255)
  doc.text('DESCRIPTION', M + 4, y + 5.8)
  doc.text('AMOUNT', PW - M - 4, y + 5.8, { align: 'right' })
  y += 8.5
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINE)
  doc.rect(M, y, CW, 14, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
  doc.text(inv.plan + ' — ' + inv.allowance + ' · ' + inv.cycle, M + 4, y + 5.8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...DIM)
  doc.text('Billing period: ' + inv.period, M + 4, y + 10.8)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
  doc.text(money(inv.amount), PW - M - 4, y + 5.8, { align: 'right' })
  y += 14 + 8

  /* totals */
  const tX = PW - M - 64, tV = PW - M
  const tRow = (l: string, v: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10.5 : 9)
    doc.setTextColor(...(bold ? INK : DIM))
    doc.text(l, tX + 4, y + 5.2)
    doc.setTextColor(...INK)
    doc.text(v, tV - 4, y + 5.2, { align: 'right' })
    y += 7
  }
  tRow('Subtotal', money(inv.amount))
  tRow('Discount', '$0.00')
  tRow('Tax', '$0.00')
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(tX, y - 1.5, tV, y - 1.5)
  y += 2.5
  tRow('Total', money(inv.amount), true)
  y += 6

  /* payment info */
  doc.setFillColor(246, 247, 251); doc.setDrawColor(...LINE)
  doc.roundedRect(M, y, CW, 16, 2, 2, 'FD')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...DIM)
  doc.text('PAYMENT METHOD', M + 4, y + 5.5)
  doc.text('TRANSACTION ID', M + CW / 2 + 2, y + 5.5)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK)
  doc.text(inv.payMethod, M + 4, y + 11.5)
  doc.text(inv.txn, M + CW / 2 + 2, y + 11.5)
  y += 16 + 12

  /* footer */
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DIM)
  doc.text('Thank you for choosing SafestProxy.', PW / 2, y, { align: 'center' })
  doc.setFontSize(7.5)
  doc.text('SafestProxy · app.safestproxy.com · support@safestproxy.com', PW / 2, 285, { align: 'center' })

  doc.save('SafestProxy-Invoice-' + inv.num + '.pdf')
}
