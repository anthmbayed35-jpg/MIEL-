# MIEL+ operations guide

Everything needed to run the store in production. Variable **names** only; never paste values into chat, tickets or git.

## 1. Environments

| Environment | Where it runs | Database | `MIEL_ENV` |
|---|---|---|---|
| **Production** | Vercel "Production" | the **production** Supabase project | `production` |
| **Staging / preview** | Vercel "Preview" deployments | a **separate staging** Supabase project | `staging` |
| **Local development** | your computer | the staging project (or none: the store then runs from the config files and `/admin` stays closed) | `development` |

Two protections make it impossible for a non-production environment to touch production data:
1. Every environment holds `MIEL_PRODUCTION_SUPABASE_URL` (the production project URL). If `NEXT_PUBLIC_SUPABASE_URL` equals it anywhere except the production deployment, the **build fails**, the **server refuses to boot**, and `getDb()` throws.
2. The production deployment must use the production URL, and Vercel's own `VERCEL_ENV` decides what counts as production (a Preview can never be production, whatever `MIEL_ENV` says).

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (choose the Production or Preview scope as shown) and, for your computer, in a git-ignored `.env.local`.

| Variable | Production | Preview / staging | Local | Secret? | Purpose |
|---|---|---|---|---|---|
| `MIEL_ENV` | `production` | `staging` | `development` | no | which environment this is |
| `MIEL_PRODUCTION_SUPABASE_URL` | prod URL | prod URL | prod URL | no | lets every environment refuse the production project |
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | **staging** URL | **staging** URL | no | database for this environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key | staging anon key | public by design | sign-in on the server; RLS limits it to storefront reads |
| `SUPABASE_SERVICE_ROLE_KEY` | prod key | staging key | staging key | **YES** (mark Sensitive) | server-only database access; never in browser code |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` | preview/staging URL | `http://localhost:3000` | no | links in emails, share images, sitemap |
| `STORE_TIMEZONE` | optional | optional | optional | no | defaults to `Asia/Beirut` |
| `RESEND_API_KEY`, `NOTIFY_FROM` | optional | optional | optional | **YES** | new-order emails |
| `SKIP_ENV_CHECK` | never | never | only for tests | no | bypasses the startup check (emergency/CI) |

The build and the server **fail with a clear message** when a hosted environment is missing any required variable or points at the wrong project. Run `npm run check-env` to check without printing values.

## 3. One-time Supabase setup (do it for production AND staging)

1. Create the project (Frankfurt is closest to Lebanon). Production should be on the **Pro** plan: free projects pause after a week of inactivity and have no daily backups.
2. **SQL editor** → run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_security.sql` (once each, in order). `0002` enables strict row-level security, locks down functions, adds the storage limits and removes order data from Realtime.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled and **turn OFF "Allow new users to sign up"**. (The code never calls sign-up and admin access also requires an active row in `admin_users`, but keep the switch off.)
4. **Authentication → Providers**: leave every social/phone provider off. **Multi-Factor → TOTP** must be enabled (it is by default).
5. **Authentication → Policies / Password**: minimum length 12 (the app also enforces it). On Pro, turn on leaked-password protection.
6. **Authentication → URL Configuration**: *Site URL* = the environment's site URL; add `<site URL>/admin/auth/confirm` to *Redirect URLs*.
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

## 5. Deploy

1. `npm run verify` passes locally.
2. Vercel Production has every variable from section 2 (production values). Vercel Preview has the staging values.
3. Push to `main`. Vercel builds; the build fails with a clear message if anything is missing or wrong.
4. After the first production deploy: **Settings → Sync products from config**, then **Inventory** (starting stock), **Shipping & delivery** (real fees and couriers), **Settings → Store details** (real WhatsApp number).

## 6. Go-live test order (do this once, on production)

1. On your phone open the live store, add a pouch, check out with your own number and a real address.
2. Check: WhatsApp opens with the message to **your** number; the order shows in **Admin → Orders** as **#1001** within ~5 seconds (bell badge + soft sound); **Inventory** dropped by one; the dashboard shows the order.
3. Open the order, move it through the statuses, then **Cancel it with a reason**. Stock is restored. Nothing is ever hard-deleted.

If the first real order is not #1001 (e.g. you tested earlier), see section 7.

## 7. Demo data, backups, order numbering

* Demo rows are identified **only** by `is_demo = true`. `npm run purge-demo` is a dry run; `npm run purge-demo -- --confirm` backs every row up to `/backups/<timestamp>/*.csv` (git-ignored) and then deletes them. Anything marked demo but connected to a real order is **listed and skipped**, never deleted. Afterwards, if no orders remain, the counter is reset so the next order is #1001.
* `npm run seed-demo -- --yes` creates fake data for staging only. It refuses to run if `NODE_ENV`/`MIEL_ENV`/`VERCEL_ENV` is production, if the URL is the production project, or if `MIEL_PRODUCTION_SUPABASE_URL` is unset.
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

`npm run verify` = typecheck → lint → unit → integration (incl. real-Postgres row-level-security tests) → production build → end-to-end tests against a production build made with sentinel secrets.

Not covered by automated tests (needs the real Supabase project): invite/reset emails actually arriving, real TOTP enrolment, and the production database itself. Use section 6 after deploying.

## 11. Key rotation

If a service-role key may have leaked: Supabase → Settings → API → regenerate, update `SUPABASE_SERVICE_ROLE_KEY` in Vercel, redeploy. Then use "Sign out everywhere" and review the activity log.
