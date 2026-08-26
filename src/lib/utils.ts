export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/* Clipboard helper with fallback for non-secure contexts */
export function safeCopy(text: string, done?: () => void) {
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) { /* noop */ }
    ta.remove()
    if (done) done()
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => done && done()).catch(fallback)
  } else fallback()
}

export function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtReq(n: number) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString()
}

export function compactNum(v: number) {
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'k'
  return v.toLocaleString()
}

export function maskKey(k: string) {
  return k.slice(0, 6) + '••••••••••••' + k.slice(-4)
}

export function randKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'SP-'
  const arr = new Uint8Array(24)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(arr)
  else arr.forEach((_, i) => (arr[i] = Math.floor(Math.random() * 256)))
  for (let i = 0; i < 24; i++) s += chars[arr[i] % chars.length]
  return s
}

export function randToken(len = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const arr = new Uint8Array(len)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(arr)
  else arr.forEach((_, i) => (arr[i] = Math.floor(Math.random() * 256)))
  let s = ''
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length]
  return s
}

export function dateKey(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
