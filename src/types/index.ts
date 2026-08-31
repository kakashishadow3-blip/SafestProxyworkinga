export interface Profile {
  id: string
  email: string
  username: string | null
  is_admin: boolean
  created_at: string
}

export interface Plan {
  id: string
  name: string
  price: number
  bandwidth_gb: number
  duration_days: number
  is_active?: boolean
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  plan_id: string | null
  status: 'active' | 'inactive' | 'expired' | 'suspended'
  bandwidth_used_gb: number
  bandwidth_limit_gb: number
  start_date: string | null
  expiry_date: string | null
  created_at: string
  plans?: Plan | null
}

export interface Order {
  id: string
  user_id: string
  plan_id: string | null
  amount: number
  status: 'pending' | 'paid' | 'awaiting_topup' | 'active' | 'cancelled'
  cryptomus_order_id: string | null
  created_at: string
  profiles?: { email: string; username: string | null } | null
  plans?: { name: string; duration_days: number; bandwidth_gb: number } | null
}

export interface ProxyCredential {
  id: string
  user_id: string
  dataimpulse_username: string | null
  dataimpulse_password: string | null
  host: string | null
  port: number | null
  status: 'active' | 'pending' | 'suspended'
  created_at: string
}

export interface ContactRequest {
  id: string
  user_id: string | null
  message: string
  status: 'open' | 'resolved' | 'spam'
  created_at: string
  profiles?: { email: string } | null
}

export interface AuditLog {
  id: string
  admin_user_id: string
  target_user_id: string
  action: string
  entity_type: string
  entity_id: string
  old_value: string | null
  new_value: string | null
  reason: string | null
  created_at: string
  admin?: { email: string } | null
  target?: { email: string } | null
}

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  is_read: boolean
  action_url: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface KycVerification {
  id: string
  user_id: string
  country: string | null
  status: 'under_review' | 'approved' | 'rejected'
  front_document_path: string | null
  back_document_path: string | null
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  profiles?: { email: string; username: string | null; created_at: string } | null
}

export interface CardPaymentAttempt {
  id: string
  user_id: string
  plan_name: string
  amount_usd: number
  currency: string
  country: string | null
  city: string | null
  postal_code: string | null
  created_at: string
  profiles?: { email: string } | null
}

export interface ApiRequest {
  id: string
  user_id: string
  purpose: string
  team_size: string | null
  integration: string
  expected_volume: string | null
  used_other_providers: boolean
  recent_providers: string[]
  notes: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  profiles?: { email: string } | null
}

export interface ApiKey {
  id: string
  user_id: string
  name: string
  key_masked: string
  key_hash: string
  status: 'active' | 'idle' | 'revoked'
  requests_count: number
  created_at: string
}

export interface UsageStat {
  id: string
  user_id: string
  subscription_id: string | null
  date: string
  traffic_gb: number
  extra_traffic_gb: number
  requests: number
  created_at: string
}
