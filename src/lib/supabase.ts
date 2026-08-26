import { createClient } from '@supabase/supabase-js'

// Environment variables take priority (set them in Vercel). The fallbacks
// point at the production SafestProxy project so the app works out of the box.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://noggpecapmtgnsykqcbu.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_dwxn5kUREDRfl9HYdw2lbg_aaLMW8V4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
