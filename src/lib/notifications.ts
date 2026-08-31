import { supabase } from './supabase'
import { subIsActive, subIsExpired, subIsExhausted } from './subscription'
import type { AppNotification, Subscription } from '@/types'

/* ═══ Configurable thresholds ═══ */
export const LOW_DATA_THRESHOLD_GB = 2   // notify when remaining data drops to this (GB) or below

/* ═══ Fetch / read-state ═══ */

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as AppNotification[] | null) ?? []
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
}

/* ═══ Create (dedupe-safe) ═══
   `event` makes the notification idempotent — the DB unique index
   (user_id + type + metadata.event) rejects duplicates, so calling this
   on every dashboard load / cron run can never spam the user. */
export async function pushNotification(opts: {
  userId: string
  type: string
  title: string
  message: string
  actionUrl?: string
  event?: string
}): Promise<void> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: opts.userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      action_url: opts.actionUrl ?? null,
      metadata: opts.event ? { event: opts.event } : {},
    })
    /* 23505 = unique violation → this event was already notified; that is fine */
    if (error && error.code !== '23505') console.error('notification insert failed', error)
  } catch {
    /* notifications must never break the app */
  }
}

/* ═══ Automatic plan notifications ═══
   Runs on dashboard load (client) AND in the daily cron (server).
   Dedupe keys make both paths safe to run repeatedly. */
export async function syncPlanNotifications(userId: string, subs: Subscription[]): Promise<void> {
  for (const s of subs) {
    const limit = Number(s.bandwidth_limit_gb) || 0
    const used = Number(s.bandwidth_used_gb) || 0
    const remaining = Math.max(0, limit - used)
    const planName = s.plans?.name ?? 'your plan'

    if (subIsExpired(s)) {
      await pushNotification({
        userId,
        type: 'plan_expired',
        title: 'Plan Expired',
        message: `Your ${planName} plan has expired. Please upgrade your plan to continue using our services.`,
        actionUrl: '/plans',
        event: `expired:${s.id}`,
      })
      continue
    }

    if (!subIsActive(s) || limit <= 0) continue

    if (subIsExhausted(s)) {
      await pushNotification({
        userId,
        type: 'data_exhausted',
        title: 'Data Finished',
        message: `Your ${planName} plan's data is fully used. Upgrade your plan or add more data to continue.`,
        actionUrl: '/plans',
        event: `exhausted:${s.id}`,
      })
    } else if (remaining <= LOW_DATA_THRESHOLD_GB) {
      await pushNotification({
        userId,
        type: 'low_data',
        title: 'Your Data Is Almost Used',
        message: `Only ${remaining.toFixed(2)} GB is left on your ${planName} plan. Your data may run out soon — please upgrade your plan or add more data before it runs out.`,
        actionUrl: '/plans',
        event: `lowdata:${s.id}`,
      })
    }
  }
}
