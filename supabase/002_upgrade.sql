-- ══════════════════════════════════════════════════════════════════
-- SafestProxy — 002 upgrade migration
-- Run this in the Supabase SQL Editor AFTER 001_initial_schema.sql.
--
-- What it does:
--   1. Adds profiles.username and a safe is_admin() helper (fixes the
--      recursive admin policies from 001 that queried profiles inside
--      profiles policies).
--   2. Rebuilds every RLS policy without recursion.
--   3. Grants the anon/authenticated roles access (RLS still governs rows).
--   4. Lets users create their own orders / proxy credentials / API rows.
--   5. Creates api_requests, api_keys and usage_stats.
--   6. Re-seeds the complete plan catalog shown in the dashboard
--      (5 products, GB tiers + Unlimited Residential thread plans).
--
-- NOTE: step 6 replaces all rows in public.plans. Existing subscriptions
-- and orders keep their rows but their plan_id becomes NULL
-- (on delete set null). Run it before taking real orders.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. profiles.username + admin helper ─────────────────────────────
alter table public.profiles add column if not exists username text;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- stop non-admins from granting themselves the admin flag
create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'Only admins can change the admin role';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_flag_trigger on public.profiles;
create trigger protect_admin_flag_trigger
  before update on public.profiles
  for each row execute procedure public.protect_admin_flag();

-- capture the username on signup (email/password form passes it as metadata)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    case when new.email = 'admin@safestproxy.com' then true else false end
  );
  return new;
end;
$$;

-- ── 2. rebuild RLS policies (no recursion) ──────────────────────────
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin());

drop policy if exists "Users can view own subscriptions" on public.subscriptions;
drop policy if exists "Admins can manage all subscriptions" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "subscriptions_admin_all" on public.subscriptions for all using (public.is_admin());

drop policy if exists "Users can view own orders" on public.orders;
drop policy if exists "Admins can manage all orders" on public.orders;
create policy "orders_select_own" on public.orders for select using (auth.uid() = user_id);
create policy "orders_insert_own" on public.orders for insert with check (auth.uid() = user_id);
create policy "orders_admin_all" on public.orders for all using (public.is_admin());

drop policy if exists "Users can view own credentials" on public.proxy_credentials;
drop policy if exists "Admins can manage all credentials" on public.proxy_credentials;
create policy "credentials_select_own" on public.proxy_credentials for select using (auth.uid() = user_id);
create policy "credentials_insert_own" on public.proxy_credentials for insert with check (auth.uid() = user_id);
create policy "credentials_update_own" on public.proxy_credentials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "credentials_admin_all" on public.proxy_credentials for all using (public.is_admin());

drop policy if exists "Users can create and view own requests" on public.contact_requests;
drop policy if exists "Admins can manage all contact requests" on public.contact_requests;
create policy "contact_select_own" on public.contact_requests for select using (auth.uid() = user_id);
create policy "contact_insert_own" on public.contact_requests for insert with check (auth.uid() = user_id);
create policy "contact_insert_guest" on public.contact_requests for insert with check (user_id is null);
create policy "contact_admin_all" on public.contact_requests for all using (public.is_admin());

drop policy if exists "Admins can view audit logs" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs for select using (public.is_admin());
create policy "audit_insert_admin" on public.audit_logs for insert with check (public.is_admin() and admin_user_id = auth.uid());

-- plans are public catalogue data — readable by everyone
alter table public.plans enable row level security;
drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans for select using (true);
create policy "plans_admin_all" on public.plans for all using (public.is_admin());

-- ── 3. grants (RLS still governs which rows) ────────────────────────
grant select on public.plans to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.proxy_credentials to authenticated;
grant select, insert, update, delete on public.contact_requests to authenticated;
grant select, insert on public.audit_logs to authenticated;

-- ── 4. new feature tables ───────────────────────────────────────────
create table if not exists public.api_requests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  purpose text not null,
  team_size text,
  integration text not null,
  expected_volume text,
  used_other_providers boolean default false,
  recent_providers text[] default '{}',
  notes text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);
alter table public.api_requests enable row level security;
create policy "api_requests_select_own" on public.api_requests for select using (auth.uid() = user_id);
create policy "api_requests_insert_own" on public.api_requests for insert with check (auth.uid() = user_id);
create policy "api_requests_admin_all" on public.api_requests for all using (public.is_admin());
grant select, insert, update, delete on public.api_requests to authenticated;

create table if not exists public.api_keys (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  key_masked text not null,
  key_hash text not null,
  status text default 'active' check (status in ('active','idle','revoked')),
  requests_count integer default 0,
  created_at timestamptz default now()
);
alter table public.api_keys enable row level security;
create policy "api_keys_select_own" on public.api_keys for select using (auth.uid() = user_id);
create policy "api_keys_insert_own" on public.api_keys for insert with check (auth.uid() = user_id);
create policy "api_keys_update_own" on public.api_keys for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "api_keys_delete_revoked_own" on public.api_keys for delete using (auth.uid() = user_id and status = 'revoked');
create policy "api_keys_admin_all" on public.api_keys for all using (public.is_admin());
grant select, insert, update, delete on public.api_keys to authenticated;

create table if not exists public.usage_stats (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  date date not null,
  traffic_gb numeric default 0,
  extra_traffic_gb numeric default 0,
  requests integer default 0,
  created_at timestamptz default now(),
  unique (user_id, subscription_id, date)
);
alter table public.usage_stats enable row level security;
create policy "usage_select_own" on public.usage_stats for select using (auth.uid() = user_id);
create policy "usage_admin_all" on public.usage_stats for all using (public.is_admin());
grant select, insert, update, delete on public.usage_stats to authenticated;

-- ── 5. full plan catalogue (matches the dashboard pricing exactly) ──
delete from public.plans;

insert into public.plans (name, price, bandwidth_gb, duration_days) values
  -- Residential Proxy
  ('Residential 52GB',   18,   52,   30),
  ('Residential 65GB',   22,   65,   30),
  ('Residential 135GB',  39,   135,  30),
  ('Residential 240GB',  65,   240,  30),
  ('Residential 520GB',  120,  520,  30),
  ('Residential 760GB',  165,  760,  30),
  ('Residential 1TB',    210,  1000, 30),
  ('Residential 2TB',    380,  2000, 30),
  -- Mobile Proxy
  ('Mobile 52GB',        35,   52,   30),
  ('Mobile 65GB',        42,   65,   30),
  ('Mobile 135GB',       75,   135,  30),
  ('Mobile 240GB',       130,  240,  30),
  ('Mobile 520GB',       240,  520,  30),
  ('Mobile 760GB',       330,  760,  30),
  ('Mobile 1TB',         420,  1000, 30),
  ('Mobile 2TB',         760,  2000, 30),
  -- Static Residential Proxy
  ('Static Residential 52GB',   20,   52,   30),
  ('Static Residential 65GB',   24,   65,   30),
  ('Static Residential 135GB',  42,   135,  30),
  ('Static Residential 240GB',  70,   240,  30),
  ('Static Residential 520GB',  128,  520,  30),
  ('Static Residential 760GB',  175,  760,  30),
  ('Static Residential 1TB',    225,  1000, 30),
  ('Static Residential 2TB',    400,  2000, 30),
  -- Datacenter Proxy
  ('Datacenter 52GB',    8,    52,   30),
  ('Datacenter 65GB',    10,   65,   30),
  ('Datacenter 135GB',   18,   135,  30),
  ('Datacenter 240GB',   30,   240,  30),
  ('Datacenter 520GB',   55,   520,  30),
  ('Datacenter 760GB',   75,   760,  30),
  ('Datacenter 1TB',     95,   1000, 30),
  ('Datacenter 2TB',     170,  2000, 30),
  -- Unlimited Residential (threads × period, bandwidth_gb = 0 = unlimited)
  ('Unlimited Residential 100 Threads · Day',    5,   0, 1),
  ('Unlimited Residential 200 Threads · Day',    9,   0, 1),
  ('Unlimited Residential 400 Threads · Day',    16,  0, 1),
  ('Unlimited Residential 500 Threads · Day',    20,  0, 1),
  ('Unlimited Residential 700 Threads · Day',    27,  0, 1),
  ('Unlimited Residential 1000 Threads · Day',   38,  0, 1),
  ('Unlimited Residential 100 Threads · Week',   28,  0, 7),
  ('Unlimited Residential 200 Threads · Week',   50,  0, 7),
  ('Unlimited Residential 400 Threads · Week',   90,  0, 7),
  ('Unlimited Residential 500 Threads · Week',   112, 0, 7),
  ('Unlimited Residential 700 Threads · Week',   150, 0, 7),
  ('Unlimited Residential 1000 Threads · Week',  210, 0, 7),
  ('Unlimited Residential 100 Threads · Month',  95,  0, 30),
  ('Unlimited Residential 200 Threads · Month',  170, 0, 30),
  ('Unlimited Residential 400 Threads · Month',  300, 0, 30),
  ('Unlimited Residential 500 Threads · Month',  375, 0, 30),
  ('Unlimited Residential 700 Threads · Month',  500, 0, 30),
  ('Unlimited Residential 1000 Threads · Month', 700, 0, 30);
