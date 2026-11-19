# MIEL+ operations guide

Everything needed to run the store in production. Variable **names** only; never paste values into chat, tickets or git.

## 1. Environments

| Environment | Where it runs | Database | `MIEL_ENV` |
|---|---|---|---|
| **Production** | Railway environment named `production` | the **production** Supabase project | `production` |
| **Staging** | another Railway environment (e.g. `staging`) | a **separate staging** Supabase project | `staging` |
| **Local development** | your computer | the staging project (or none: the store then runs from the config files and `/admin` stays closed) | `development` |

Two protections make it impossible for a non-production environment to touch production data:
1. Every environment holds `MIEL_PRODUCTION_SUPABASE_URL` (the production project URL). If `NEXT_PUBLIC_SUPABASE_URL` equals it anywhere except the production deployment, the **build fails**, the **server refuses to boot**, and `getDb()` throws.
2. The production deployment must use the production URL, and Railway's own environment name decides what counts as production: `MIEL_ENV=production` is only accepted in the Railway environment named exactly `production`, and that environment must say `MIEL_ENV=production` (a staging environment can never claim to be production).

## 2. Environment variables

Set these as **Railway service variables** (Railway → project → environment → the web service → **Variables**) and, for your computer, in a git-ignored `.env.local`.

> **Every variable below must exist at BUILD time**, not only at runtime. The build validates them, bakes the three `NEXT_PUBLIC_*` values into the browser code, and pre-renders the storefront from the database. Railway makes service variables available to the build automatically; set them **before** the first deploy, and **redeploy after changing any `NEXT_PUBLIC_*` value** (a restart is not enough).

| Variable | Production | Staging | Local | Secret? | Purpose |
|---|---|---|---|---|---|
| `MIEL_ENV` | `production` | `staging` | `development` | no | which environment this is |
| `MIEL_PRODUCTION_SUPABASE_URL` | prod URL | prod URL | prod URL | no | lets every environment refuse the production project |
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | **staging** URL | **staging** URL | no | database for this environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key | staging anon key | public by design | sign-in on the server; RLS limits it to storefront reads |
| `SUPABASE_SERVICE_ROLE_KEY` | prod key | staging key | staging key | **YES** (mark Sensitive) | server-only database access; never in browser code |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` (final domain, https, no trailing slash) | the staging URL | `http://localhost:3000` | no | the ONLY source of absolute URLs: sitemap, robots, Open Graph, JSON-LD, invite/reset email links |
| `PORT` | set by Railway | set by Railway | optional | no | port the server listens on (it always binds `0.0.0.0`) |
| `STORE_TIMEZONE` | optional | optional | optional | no | defaults to `Asia/Beirut` |
| `RESEND_API_KEY`, `NOTIFY_FROM` | optional | optional | optional | **YES** | new-order emails |
| `SKIP_ENV_CHECK` | never | never | only for tests | no | bypasses the startup check (emergency/CI) |

Railway also sets `RAILWAY_ENVIRONMENT_NAME` itself (do not set it). Nothing in the app reads any Vercel variable any more.

The build and the server **fail with a clear message** when a hosted environment is missing any required variable or points at the wrong project. Run `npm run check-env` to check without printing values.

## 3. One-time Supabase setup (do it for production AND staging)

1. Create the project (Frankfurt is closest to Lebanon; put Railway in Europe West / Amsterdam so app and database are in the same region). Production should be on the **Pro** plan: free projects pause after a week of inactivity and have no daily backups.
2. **SQL editor** → run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_security.sql` (once each, in order). `0002` enables strict row-level security, locks down functions, adds the storage limits and removes order data from Realtime.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled and **turn OFF "Allow new users to sign up"**. (The code never calls sign-up and admin access also requires an active row in `admin_users`, but keep the switch off.)
4. **Authentication → Providers**: leave every social/phone provider off. **Multi-Factor → TOTP** must be enabled (it is by default).
5. **Authentication → Policies / Password**: minimum length 12 (the app also enforces it). On Pro, turn on leaked-password protection.
6. **Authentication → URL Configuration**: *Site URL* = the environment's `NEXT_PUBLIC_SITE_URL` exactly (e.g. `https://your-domain`); add `<that URL>/admin/auth/confirm` to *Redirect URLs*. Remove the old `*.vercel.app` entries (see section 5).
7. **Authentication → Email Templates**. Replace the link in these two templates (this makes links work server-side and keeps email scanners from using them up):
   - *Invite user*: `<a href="{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/admin/set-password">Accept the invite</a>`
   - *Reset password*: `<a href="{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/admin/set-password">Choose a new password</a>`
8. **Authentication → SMTP**: Supabase's built-in mailer is heavily rate-limited. Add your own SMTP (e.g. Resend) before inviting more than a couple of people.
9. **Storage**: bucket `product-images` should exist (public read, 8 MB, webp/jpeg/png). `0002` sets this.
10. **Database → Replication**: `orders` should NOT be in `supabase_realtime` (`0002` removes it).
11. **Settings → API**: copy the URL, `anon` key and `service_role` key into the matching environment (section 2).

## 4. First owner (once per environment)

With that environment's variables loaded in your terminal (and `MIEL_ENV` set to match):

```bash
npm run create-owner -- --email you@example.com --name "Your Name"
```

It emails you a link; you choose your own password. It never creates, shows or logs a password, and **refuses to run if an owner already exists**. Everyone after that is invited from **Settings → Team** (owner only). Sign in at `/admin/login`, then open **My account** and turn on two-factor authentication. In **Settings → Security** the owner can require it for everyone.

## 5. Deploy on Railway

The repo contains `railway.json`, so Railway already knows how to build, start, health-check and restart the app:

| Setting | Value |
|---|---|
| Builder | Railpack (Node ≥ 22, from `package.json`) |
| Build | `npm run build` (clears stale fetch cache → `next build` → copies static files into the standalone server) |
| Start | `npm start` (runs `scripts/start.mjs`: standalone server on `0.0.0.0:$PORT`) |
| Health check | `/api/health` (200 only when the server is up **and** the database answers; 503 otherwise) |
| Restart policy | on failure, up to 10 times |
| Replicas | **1** |

### Why exactly one replica
Storefront pages are cached by the Next.js server (ISR, refreshed every 5 minutes). When an admin saves a product, setting, discount or shipping zone, the server runs `revalidatePath`, which clears the cache **inside that one process**. With two or more replicas only the replica that handled the admin's save would update. The others would keep serving the old price, stock or content for up to 5 minutes, and different visitors would see different prices depending on which replica answered. The in-memory rate limiter on checkout is also per instance. Never raise `numReplicas`, or the replica count in the dashboard, above 1. (If you ever need more capacity, the cache must first move to a shared store.) A deploy replaces the instance, with a few seconds of overlap while the new one passes its health check, which is fine.

### Exact steps (first deploy)
1. Run `npm run verify` locally (everything green).
2. **Railway → New Project → Deploy from GitHub repo** → pick this repository, branch `main`. Name the environment `production`.
3. **Settings → Region**: choose **Europe West (Amsterdam)**, replicas **1** (the region is set in the dashboard; it is not in `railway.json`).
4. **Variables**: add every production variable from section 2 (`MIEL_ENV=production`, `MIEL_PRODUCTION_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, and optionally `STORE_TIMEZONE`, `RESEND_API_KEY`, `NOTIFY_FROM`). Do not set `PORT`.
5. **Settings → Networking → Generate domain** (a temporary `*.up.railway.app` address) and, when ready, **Custom domain** → your final domain. Railway shows the DNS record to create at your registrar (usually a `CNAME`; for a bare domain use the `ALIAS`/`ANAME` or the A record Railway lists). Railway issues the HTTPS certificate automatically once DNS resolves.
6. **Set `NEXT_PUBLIC_SITE_URL` to the final domain *before* the build you will go live with**, because it is baked in at build time. If you change it later, redeploy.
7. **Settings → Deploy**: confirm start command `npm start`, health check path `/api/health`, and that the config source is `railway.json`.
8. Deploy. The build fails with a clear message if a variable is missing or points at the wrong Supabase project. The deploy only goes live when `/api/health` returns 200.
9. Update **Supabase Auth URLs** (below), then do section 4 (first owner) if this is a new project.
10. After the first production deploy: **Settings → Sync products from config**, then **Inventory** (starting stock), **Shipping & delivery** (real fees and couriers), **Settings → Store details** (real WhatsApp number).

### Supabase Auth changes you must make by hand (staging and production)
Supabase → **Authentication → URL Configuration**:
* **Site URL**: change from the old Vercel address to `NEXT_PUBLIC_SITE_URL` (e.g. `https://your-domain`).
* **Redirect URLs**: add `https://your-domain/admin/auth/confirm`; delete the `*.vercel.app` entries. If you test on the temporary Railway domain first, add `https://<name>.up.railway.app/admin/auth/confirm` too and remove it afterwards.
* **Email templates** (Invite user, Reset password) use `{{ .SiteURL }}`, so they follow the Site URL automatically; re-check them after the change (section 3, step 7).

Invite and reset links are generated from `NEXT_PUBLIC_SITE_URL`. If the Redirect URL list does not contain it, Supabase silently falls back to the Site URL and the link may not work.

### Moving from Vercel (cut-over order)
1. Deploy on Railway with the temporary domain and run section 6 against it.
2. Switch DNS to Railway (lower the DNS TTL a day before). Wait until the custom domain shows as active in Railway.
3. Update the Supabase Auth URLs (above) and redeploy if `NEXT_PUBLIC_SITE_URL` changed.
4. Keep Vercel running for a day as a fallback, then delete the Vercel project. Two live copies would each have their own cache and both write to the production database.

### Operating it
* **Logs**: Railway → service → Deployments → View logs. **Rollback**: Deployments → pick an older successful deploy → Redeploy.
* **Crashes**: restarts are automatic (policy above). A deploy whose health check keeps failing never replaces the working one.
* **Revalidation**: admin saves update the storefront immediately (tested end to end in `tests/e2e/railway-flows.spec.ts`). Every restart or redeploy starts with an empty cache, which is harmless.

## 6. Go-live test order (do this once, on production)

1. On your phone open the live store, add a pouch, check out with your own number and a real address.
2. Check: WhatsApp opens with the message to **your** number; the order shows in **Admin → Orders** as **#1001** within ~5 seconds (bell badge + soft sound); **Inventory** dropped by one; the dashboard shows the order.
3. Open the order, move it through the statuses, then **Cancel it with a reason**. Stock is restored. Nothing is ever hard-deleted.

If the first real order is not #1001 (e.g. you tested earlier), see section 7.

## 7. Demo data, backups, order numbering

* Demo rows are identified **only** by `is_demo = true`. `npm run purge-demo` is a dry run; `npm run purge-demo -- --confirm` backs every row up to `/backups/<timestamp>/*.csv` (git-ignored) and then deletes them. Anything marked demo but connected to a real order is **listed and skipped**, never deleted. Afterwards, if no orders remain, the counter is reset so the next order is #1001.
* `npm run seed-demo -- --yes` creates fake data for staging only. It refuses to run if `NODE_ENV`/`MIEL_ENV` is production, if the Railway environment is named `production`, if the URL is the production project, or if `MIEL_PRODUCTION_SUPABASE_URL` is unset.
* Production: turn on daily backups (Pro) / PITR in Supabase, and download the activity log and orders CSV regularly.

## 8. Roles

| | Staff | Manager | Owner |
|---|---|---|---|
| Orders, customers, inventory | ✅ | ✅ | ✅ |
| View products | ✅ | ✅ | ✅ |
| Edit products, discounts, shipping, content, marketing, analytics | ❌ | ✅ | ✅ |
| CSV exports | ❌ | ✅ | ✅ |
| Delete anything (images, testimonials) | ❌ | ❌ | ✅ |
| Settings, team, security | ❌ | ❌ | ✅ |

Enforced three times: the proxy, the server code on every page/action/route, and row-level security in Postgres.

## 9. Sessions and sign-in

* Email + password only; accounts exist only by invitation. Sessions end after **12 hours without activity**; "Sign out everywhere" is under *My account*.
* Auth cookies are `HttpOnly`, `Secure` (production) and `SameSite=Lax`.
* Failed logins, reset requests and wrong 2FA codes are rate-limited and logged (emails are stored only as salted hashes). Every login, failed login, logout, role change, invite and password change is in **Settings → Activity log**.
* Lost authenticator phone: in Supabase → Authentication → Users → the person → remove their factor; they sign in with their password and set 2FA up again.

## 10. Quality gate

`npm run verify` = typecheck → lint → unit → integration (incl. real-Postgres row-level-security tests) → production build → end-to-end tests. The end-to-end tests build the app and start it with `npm start` exactly as Railway does, against a tests-only mock of Supabase (`tests/support/mock-supabase.ts`), and cover the health check, login, checkout, the live new-order alert, image upload, storefront revalidation after an admin edit, and the URL rules.

Not covered by automated tests (needs the real Supabase project): invite/reset emails actually arriving, real TOTP enrolment, and the production database itself. Use section 6 after deploying.

## 11. Key rotation

If a service-role key may have leaked: Supabase → Settings → API → regenerate, update `SUPABASE_SERVICE_ROLE_KEY` in Railway (Variables), redeploy. Then use "Sign out everywhere" and review the activity log.
