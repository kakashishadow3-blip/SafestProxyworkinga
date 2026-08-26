import { useCallback, useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export interface DashboardCtx {
  subscription: Subscription | null
  refreshSubscription: () => Promise<void>
}

export function useDashboard() {
  return useOutletContext<DashboardCtx>()
}

export default function DashboardLayout() {
  const { user, profile } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  const refreshSubscription = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('expiry_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSubscription(data as Subscription | null)
  }, [user])

  useEffect(() => { refreshSubscription() }, [refreshSubscription])

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
        isAdmin={!!profile?.is_admin}
      />

      <div className="main">
        <TopBar subscription={subscription} />
        <div className="content">
          <Outlet context={{ subscription, refreshSubscription } satisfies DashboardCtx} />
        </div>
      </div>
    </>
  )
}
