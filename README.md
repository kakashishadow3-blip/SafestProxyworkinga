# SafestProxy — Dashboard

Complete production-ready dashboard for SafestProxy: React 18 + TypeScript + Vite, with a real Supabase backend (auth, Postgres, RLS) and a full admin panel.

## Stack

- **Frontend:** React 18, TypeScript (strict), Vite 5, react-router-dom v6, Chart.js 4, jsPDF
- **Backend:** Supabase (Auth + Postgres + Row Level Security)
- **Deploy target:** Vercel (SPA, `vercel.json` rewrites included)

## What's included

- **Auth:** email/password signup + login, **Continue with Google / GitHub** (Supabase OAuth). New signups start with a **Non-Active** plan. No separate password-reset page — users update their password from **Profile** (synced straight into Supabase Auth).
- **Dashboard tabs:** Overview (usage chart + plan/balance cards), Proxy Access, API Management, Available Plans, Billing (invoices + PDF download), Profile.
- **Proxy Access:** gateway credentials (host `gate.safestproxy.com`, port `7777`), show/copy, country-targeted sticky pool generator (1–3,000 lines, copy-all / download .txt). Without funds/bandwidth the generator shows exactly: *"You don't have any funds/bandwidth available."*
- **API Management:** manual approval flow (`none → pending → approved`), API key generation with one-time display + masked list, revoke/delete with confirmations.
- **Plans:** 5 products × GB tiers + Unlimited Residential (threads × day/week/month), prices served from the `plans` table. "Choose plan" creates an order with status `awaiting_topup`.
- **Billing:** current plan panel, spend stats, invoice history from orders, printable invoice view + native jsPDF A4 download.
- **Admin panel** (`/admin`, visible only for `is_admin` profiles):
  - Pending Top-ups — approve (activates subscription + creates proxy credentials) / reject
  - API Requests — approve / reject
  - Contact Requests — resolve / spam
  - Users — **Access Dashboard** opens any user's full dashboard (Overview, Proxy Access, API, Plans, Billing, Profile) plus a **Manage User** editor (username, admin role, subscription plan/status/limits/expiry, proxy credentials username/password/host/port/status)
  - Audit Logs — every admin action is recorded

## Supabase setup (one-time, ~2 minutes)

1. Open your Supabase project → **SQL Editor**.
2. Run `supabase/001_initial_schema.sql` (if not already applied).
3. Run `supabase/002_upgrade.sql` — **required**. It fixes the recursive admin policies, grants table access, adds `profiles.username`, creates `api_requests` / `api_keys` / `usage_stats`, and seeds the full plan catalogue (all prices shown in the dashboard).
4. **OAuth:** Supabase Dashboard → Authentication → Providers → enable **Google** and **GitHub**, then add your domains to **Authentication → URL Configuration** (Site URL + Redirect URLs: `http://localhost:5173/**`, `https://your-app.vercel.app/**`).
5. The account `admin@safestproxy.com` automatically becomes admin on signup (see `handle_new_user()`). To make another account admin: `update public.profiles set is_admin = true where email = 'you@example.com';`

## Environment variables

The app reads:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://noggpecapmtgnsykqcbu.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` (publishable key — safe to expose) |

Defaults are baked into `src/lib/supabase.ts`, so the app works without env vars; set them in Vercel (Project → Settings → Environment Variables) if you ever switch projects.

## Deploy to Vercel

1. Push this folder to a Git repository (or use Vercel CLI `vercel` from this directory).
2. Vercel auto-detects **Vite**. Build command `npm run build`, output `dist` — no config needed (`vercel.json` handles SPA rewrites).
3. Add the two env vars above (optional — defaults included).
4. Deploy. Then add your production URL to Supabase → Authentication → URL Configuration so OAuth redirects work.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Order → activation flow

1. User clicks **Choose plan** on `/plans` → order created (`awaiting_topup`) and appears in Billing as a pending invoice.
2. Admin sees it under **Admin Panel → Pending Top-ups** and clicks **Approve**.
3. Approval expires the old active subscription, creates the new active subscription (limit = plan GB, expiry = now + duration), ensures proxy credentials exist, and writes an audit log.
4. The user's dashboard immediately shows the plan as Active; proxy generation unlocks.
