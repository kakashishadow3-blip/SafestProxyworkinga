-- ══════════════════════════════════════════════════════════════════
-- 003_payments.sql — Cryptomus auto-payments + admin plan manager
-- Run in Supabase → SQL Editor after 001 and 002.
-- ══════════════════════════════════════════════════════════════════

-- Plans can be hidden from the storefront by the admin (Plan Manager → Live/Hidden).
alter table public.plans add column if not exists is_active boolean not null default true;

-- Orders already have cryptomus_order_id (from 001) — the Cryptomus payment uuid
-- is stored there. Order statuses used by the payment flow:
--   pending          → order created, waiting for payment
--   paid             → payment confirmed by Cryptomus webhook (auto-activated)
--   awaiting_topup   → legacy manual-approval orders (still payable)
--   active/cancelled → unchanged

-- Speed up webhook + status polling lookups.
create index if not exists orders_user_status_idx on public.orders (user_id, status);
