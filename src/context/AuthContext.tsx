import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signUp: (email: string, password: string, username: string, captchaToken?: string) => ReturnType<typeof supabase.auth.signUp>
  signIn: (email: string, password: string, captchaToken?: string) => ReturnType<typeof supabase.auth.signInWithPassword>
  signOut: () => ReturnType<typeof supabase.auth.signOut>
  signInWithGoogle: () => ReturnType<typeof supabase.auth.signInWithOAuth>
  signInWithGithub: () => ReturnType<typeof supabase.auth.signInWithOAuth>
  updatePassword: (password: string) => ReturnType<typeof supabase.auth.updateUser>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchProfile(userId: string) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return (data as Profile | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) setProfile(await fetchProfile(session.user.id))
      if (mounted) setLoading(false)
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) {
        // Small delay so the handle_new_user trigger has committed the profile row
        setTimeout(async () => {
          if (mounted) setProfile(await fetchProfile(session.user!.id))
        }, 600)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

    const signUp = (email: string, password: string, username: string, captchaToken?: string) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { username }, ...(captchaToken ? { captchaToken } : {}) },
    })

  const signIn = (email: string, password: string, captchaToken?: string) =>
    supabase.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    })

  const signOut = () => supabase.auth.signOut()

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } })

  const signInWithGithub = () =>
    supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: `${window.location.origin}/` } })

  const updatePassword = (password: string) => supabase.auth.updateUser({ password })

  const refreshProfile = async () => {
    if (user) setProfile(await fetchProfile(user.id))
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, signInWithGoogle, signInWithGithub, updatePassword, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
