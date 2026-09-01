import { useCallback, useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { subIsActive } from '@/lib/subscription'
import { syncPlanNotifications } from '@/lib/notifications'
import type { Subscription } from '@/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export interface DashboardCtx {
  subscription: Subscription | null        // primary (first active, else latest)
  subscriptions: Subscription[]            // ALL subscriptions (multi-plan model)
  refreshSubscription: () => Promise<void>
}

export function useDashboard() {
  return useOutletContext<DashboardCtx>()
}

export default function DashboardLayout() {
  const { user, profile } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  const refreshSubscription = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    const subs = (data as Subscription[] | null) ?? []
    setSubscriptions(subs)
    /* automatic plan notifications (expired / low-data / exhausted) — deduped at DB level.
       When the sync finishes, tell the bell to re-fetch so the unread badge updates
       immediately without the user clicking anything. */
    syncPlanNotifications(user.id, subs)
      .finally(() => window.dispatchEvent(new Event('ntf-synced')))
  }, [user])

  useEffect(() => { refreshSubscription() }, [refreshSubscription])

  /* Primary subscription for the top bar: first effectively-active plan, else the latest row */
  const subscription = subscriptions.find(s => subIsActive(s)) ?? subscriptions[0] ?? null

  return (
    <>
      <div className={cn('hamburger', sidebarOpen && 'hidden')} onClick={() => setSidebarOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </div>
      <div className={cn('sidebar-backdrop', sidebarOpen && 'show')} onClick={() => setSidebarOpen(false)} />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        subscription={subscription}
        subscriptions={subscriptions}
        isAdmin={!!profile?.is_admin}
      />

      <div className="main">
        <TopBar subscription={subscription} />
        <div className="content">
          <Outlet context={{ subscription, subscriptions, refreshSubscription } satisfies DashboardCtx} />
        </div>
      </div>
    </>
  )
}
