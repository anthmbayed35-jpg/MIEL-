# MIEL+ admin: setup

## 1. Supabase project
1. Create a project at supabase.com (any region; Frankfurt is closest to Lebanon).
2. **SQL editor** → paste `supabase/migrations/0001_init.sql` → Run. This creates every table, the row-level security policies, the stock function and the `product-images` storage bucket.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up". (Admin access is also gated by the `admin_users` table, so a stray account can't enter, but keep sign-ups off anyway.)
4. **Database → Replication**: confirm `orders` is enabled for Realtime (the migration does this; check it if the bell doesn't update live).

## 2. Environment variables
Copy `.env.example` to `.env.local` for local work, and add the same variables in **Vercel → Project → Settings → Environment Variables**:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` key. **Secret. Server only. Never commit it.** |
| `NEXT_PUBLIC_SITE_URL` | your live domain |
| `RESEND_API_KEY`, `NOTIFY_FROM` | optional, for new-order emails |

## 3. First admin (owner)
```bash
node --env-file=.env.local scripts/create-admin.mjs you@example.com "Your Name" owner
```
It prints a temporary password once. Sign in at `/admin/login`, then change it (Supabase → Authentication → Users → your user → send password recovery).

## 4. First run
1. Sign in → **Settings → Sync products from config** (loads RED BURN, GOLD, CREATINE into the database).
2. **Inventory**: set your starting stock. (Stock starts at 0, so checkout says "out of stock" until you add it.)
3. **Settings → Shipping & delivery**: replace the placeholder fees and add your delivery partners.
4. **Settings → Store details**: set your real WhatsApp number (orders open WhatsApp to this number).
5. Optional: **Settings → Load demo data** to see the dashboard populated; wipe it with one click when you're done.

## 5. Deploy
Push to GitHub; Vercel redeploys. Until the Supabase variables are set, the live site keeps working from the config files (WhatsApp-only checkout) and `/admin` shows "not configured".

## Local development without Supabase
`npm run dev` with no Supabase variables uses a local JSON store in `.data/` (git-ignored). The login page offers "Enter as owner / manager / staff". This mode is disabled on Vercel.
