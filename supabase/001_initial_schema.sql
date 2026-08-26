-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- Plans table
create table public.plans (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  price numeric not null,
  bandwidth_gb integer not null,
  duration_days integer not null,
  created_at timestamptz default now()
);

-- Subscriptions table
create table public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  plan_id uuid references public.plans(id) on delete set null,
  status text default 'inactive' check (status in ('active','inactive','expired','suspended')),
  bandwidth_used_gb numeric default 0,
  bandwidth_limit_gb numeric not null,
  start_date timestamptz,
  expiry_date timestamptz,
  created_at timestamptz default now()
);

-- Orders table
create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  plan_id uuid references public.plans(id) on delete set null,
  amount numeric not null,
  status text default 'pending' check (status in ('pending','paid','awaiting_topup','active','cancelled')),
  cryptomus_order_id text,
  created_at timestamptz default now()
);

-- Proxy credentials table
create table public.proxy_credentials (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  dataimpulse_username text,
  dataimpulse_password text,
  host text,
  port integer,
  status text default 'pending' check (status in ('active','pending','suspended')),
  created_at timestamptz default now()
);

-- Contact requests table
create table public.contact_requests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  message text not null,
  status text default 'open' check (status in ('open','resolved','spam')),
  created_at timestamptz default now()
);

-- Audit logs table
create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  admin_user_id uuid references public.profiles(id) on delete cascade not null,
  target_user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz default now()
);

-- Insert default plans
insert into public.plans (name, price, bandwidth_gb, duration_days) values
  ('Residential 52GB', 18, 52, 30),
  ('Residential 135GB', 39, 135, 30),
  ('Residential 520GB', 120, 520, 30),
  ('Mobile 52GB', 35, 52, 30),
  ('Mobile 135GB', 75, 135, 30),
  ('Mobile 520GB', 240, 520, 30);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.orders enable row level security;
alter table public.proxy_credentials enable row level security;
alter table public.contact_requests enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles"
  on public.profiles for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Subscriptions policies
create policy "Users can view own subscriptions"
  on public.subscriptions for select using (auth.uid() = user_id);
create policy "Admins can manage all subscriptions"
  on public.subscriptions for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Orders policies
create policy "Users can view own orders"
  on public.orders for select using (auth.uid() = user_id);
create policy "Admins can manage all orders"
  on public.orders for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Proxy credentials policies
create policy "Users can view own credentials"
  on public.proxy_credentials for select using (auth.uid() = user_id);
create policy "Admins can manage all credentials"
  on public.proxy_credentials for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Contact requests policies
create policy "Users can create and view own requests"
  on public.contact_requests for all using (auth.uid() = user_id);
create policy "Admins can manage all contact requests"
  on public.contact_requests for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Audit logs policies
create policy "Admins can view audit logs"
  on public.audit_logs for select using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, case when new.email = 'admin@safestproxy.com' then true else false end);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
