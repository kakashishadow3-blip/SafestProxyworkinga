import type { Plan } from '@/types'

export type ProductKey = 'residential' | 'mobile' | 'unlimited_residential' | 'static_residential' | 'datacenter'

export const PRODUCT_ORDER: ProductKey[] = ['residential', 'mobile', 'unlimited_residential', 'static_residential', 'datacenter']

export const PRODUCT_META: Record<ProductKey, { name: string; tabLabel: string; features: string[] }> = {
  residential: {
    name: 'Residential Proxy',
    tabLabel: 'Residential Proxy',
    features: ['195M+ rotating residential IPs', '190+ countries, city & ASN targeting', 'HTTP(S) + SOCKS5 support', 'Sticky sessions up to 30 min', '0.6s average response time', 'Dashboard & API access', 'Unlimited concurrent sessions', '24/7 live chat support'],
  },
  mobile: {
    name: 'Mobile Proxy',
    tabLabel: 'Mobile Proxy',
    features: ['Real 4G/5G carrier IPs', '30+ countries, carrier targeting', 'Auto IP rotation', 'Sticky sessions up to 30 min', 'HTTP(S) + SOCKS5 support', 'High trust score, no CAPTCHAs', 'Dashboard & API access', '24/7 live chat support'],
  },
  unlimited_residential: {
    name: 'Unlimited Residential',
    tabLabel: 'Unlimited Residential',
    features: ['Unlimited bandwidth, no GB caps', '200M+ residential rotating IPs', 'Instant + sticky rotation modes', 'Country, city & ASN targeting', 'HTTP(S) + SOCKS5 support', '24/7 live chat support', 'Dashboard & API access', 'Cancel anytime, no lock-in'],
  },
  static_residential: {
    name: 'Static Residential Proxy',
    tabLabel: 'Static Residential Proxy',
    features: ['Static residential ISP IPs', 'Keep the same IP as long as needed', '99.9% uptime SLA', 'No CAPTCHAs, high trust score', 'HTTP(S) + SOCKS5 support', 'Country & city targeting', 'Dashboard & API access', '24/7 live chat support'],
  },
  datacenter: {
    name: 'Datacenter Proxy',
    tabLabel: 'Datacenter Proxy',
    features: ['High speed, low latency', 'Dedicated datacenter IPs', 'Multiple data center locations', 'HTTP(S) + SOCKS5 support', '99.9% uptime', 'Unlimited concurrent sessions', 'Dashboard & API access', '24/7 live chat support'],
  },
}

/* Map a DB plan row to its product family */
export function productOf(name: string): ProductKey {
  if (name.startsWith('Unlimited')) return 'unlimited_residential'
  if (name.startsWith('Static')) return 'static_residential'
  if (name.startsWith('Mobile')) return 'mobile'
  if (name.startsWith('Datacenter')) return 'datacenter'
  return 'residential'
}

export function tierLabel(gb: number) {
  return gb === 1000 ? '1TB' : gb === 2000 ? '2TB' : gb + 'GB'
}
export function tierLong(gb: number) {
  return gb === 1000 ? '1 TB' : gb === 2000 ? '2 TB' : gb + ' GB'
}

/* Unlimited residential: threads are encoded in the plan name ("... 100 Threads · Day") */
export function threadsOf(plan: Plan): number {
  const m = plan.name.match(/(\d+)\s*Threads/i)
  return m ? parseInt(m[1], 10) : 100
}
export type UPeriod = 'day' | 'week' | 'month'
export function periodOf(plan: Plan): UPeriod {
  if (plan.duration_days <= 1) return 'day'
  if (plan.duration_days <= 7) return 'week'
  return 'month'
}
export const U_PERIOD_LABELS: Record<UPeriod, string> = { day: '/day', week: '/week', month: '/month' }

/* Corner-ribbon configuration: which plan gets the ribbon, and what it says.
   Unlimited Residential keys off the weekly period instead of a GB tier
   (handled in Plans.tsx). Change the popular plan for any product here only. */
export interface PopularRibbon {
  tier: number
  label: string
}
export const POPULAR_RIBBON_BY_PRODUCT: Partial<Record<ProductKey, PopularRibbon>> = {
  residential: { tier: 65, label: 'Most Popular' },
  mobile: { tier: 135, label: 'Popular' },
  static_residential: { tier: 52, label: 'Popular' },
  datacenter: { tier: 240, label: 'Popular' },
}
export const UNLIMITED_RIBBON_LABEL = 'Popular' // shown on the Weekly plan

/* Residential loads with its popular tier pre-selected */
export const DEFAULT_TIER_GB = 65
