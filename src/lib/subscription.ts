import type { Subscription } from '@/types'

/* True when the expiry date has already passed (even if the DB row still says active) */
export function subExpiredByDate(sub: Subscription | null | undefined): boolean {
  if (!sub || !sub.expiry_date) return false
  return new Date(sub.expiry_date).getTime() < Date.now()
}

/* Effectively active: status active AND within the expiry date */
export function subIsActive(sub: Subscription | null | undefined): boolean {
  return !!sub && sub.status === 'active' && !subExpiredByDate(sub)
}

/* Effectively expired: status expired/inactive/suspended OR past expiry date */
export function subIsExpired(sub: Subscription | null | undefined): boolean {
  if (!sub) return false
  if (subExpiredByDate(sub)) return true
  return sub.status !== 'active'
}

/* Active but all bandwidth consumed */
export function subIsExhausted(sub: Subscription | null | undefined): boolean {
  if (!subIsActive(sub)) return false
  if (!sub || sub.bandwidth_limit_gb <= 0) return false
  return sub.bandwidth_limit_gb - sub.bandwidth_used_gb <= 0
}
