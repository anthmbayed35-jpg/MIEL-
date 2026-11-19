# MIEL+ operations guide

Everything needed to run the store in production on Railway. Variable **names** only: never paste values into chat, tickets or git.

## 1. How it is built

| Part | What | Where |
|---|---|---|
| App | Next.js standalone server (`npm run build`, `npm start`), **one instance** | Railway service |
| Database | One SQLite file (WAL mode), SQL migrations applied automatically at start | volume, `/data/miel.db` |
| Product photos you upload | AVIF + WebP files | volume, `/data/uploads` |
| Backups | nightly snapshots (+ optional encrypted off-site copy) | volume, `/data/backups` |
| Sign-in | email + password (argon2id), database sessions, optional TOTP 2FA | in the database |
| Live alerts | Server-Sent Events, with 30 s polling as the fallback | in the app process |
| Email | Brevo API (default) or any SMTP server | external |

**The volume is the store.** Everything customers and you created lives in `/data`. Redeploys replace the app but keep `/data`. If the volume is lost and there is no backup, the data is lost. See section 6.

### Why exactly one replica
The database is a single file on one volume, a volume can only be attached to one instance, and the live-alert bus and the order lock live inside that one process. Running two instances would split the alerts (each admin would only see events from "their" instance) and cannot share the file. `railway.json` sets `numReplicas: 1`; never raise it. A redeploy has a few seconds of overlap while the new instance passes its health check, which is fine because SQLite takes a write lock per order.

## 2. Environment variables

Set these as **Railway service variables** (project → environment → the web service → **Variables**) and, for your computer, in a git-ignored `.env.local`.

> **Every variable below must exist at BUILD time**, not only at runtime. The build validates them and bakes `NEXT_PUBLIC_SITE_URL` into the browser code. Railway passes service variables to the build automatically; set them **before** the first deploy, and **redeploy after changing `NEXT_PUBLIC_SITE_URL`** (a restart is not enough).
> The volume is **not** mounted during the build, only at runtime. That is fine: the build never opens the database.

| Variable | Needed in | Secret? | Purpose |
|---|---|---|---|
| `MIEL_ENV` | production, staging | no | `production`, `staging` or `development`. Must be `production` exactly in the Railway environment named `production` |
| `NEXT_PUBLIC_SITE_URL` | all hosted | no | the final domain, `https://…`, no trailing slash. The ONLY source of absolute URLs: sitemap, robots, Open Graph, invite and reset links. Build-time |
| `DATABASE_PATH` | all hosted | no | absolute path of the database file. Production: `/data/miel.db` (the volume mount path + file name) |
| `AUTH_SECRET` | all hosted | **YES** | 32+ random characters. Encrypts two-factor secrets and salts hashes in logs and rate limits. Changing it invalidates every enrolled authenticator (people re-enrol) |
| `MAIL_FROM` | production | no | sender, e.g. `MIEL+ <orders@your-domain.com>` (a verified sender, see section 7) |
| `BREVO_API_KEY` | production (default mail provider) | **YES** | Brevo API key |
| `MAIL_PROVIDER` | optional | no | `brevo` (default) or `smtp` |
| `SMTP_URL` | when `MAIL_PROVIDER=smtp` | **YES** | `smtp://user:password@host:587` |
| `STORE_TIMEZONE` | optional | no | defaults to `Asia/Beirut` |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_PREFIX` | optional | key and secret: **YES** | off-site backup bucket (section 6). Keep the encryption key too |
| `BACKUP_ENCRYPTION_KEY` | required when `BACKUP_S3_BUCKET` is set | **YES** | 32+ characters. Encrypts each off-site backup. **Store it somewhere other than Railway**: without it the off-site copies cannot be opened |
| `BACKUPS_DISABLED` | never in production | no | `1` turns off the nightly backups (tests only) |
| `MIGRATIONS_DIR` | optional | no | override the migrations folder (default `./migrations`) |
| `SKIP_ENV_CHECK` | never | no | bypasses the startup check (emergency/CI) |

Railway sets `PORT` and `RAILWAY_ENVIRONMENT_NAME` itself; do not set them. `npm run check-env` checks your environment without printing values. The build and the server **refuse to start** with a clear message when a hosted environment is missing a variable.

## 3. Exact Railway steps (first deploy)

1. Run `npm run verify` locally (everything green).
2. **Railway → New Project → Deploy from GitHub repo**, pick this repository and branch. Name the environment `production`.
3. **Service → Settings → Region**: Europe West (Amsterdam). Replicas: **1** (set in the dashboard; `railway.json` also says 1).
4. **Service → Volumes → New Volume**, mount path **`/data`**. (If the app later reports permission errors writing `/data`, add the variable `RAILWAY_RUN_UID=0`.)
5. **Variables**: add every production variable from section 2: `MIEL_ENV=production`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_PATH=/data/miel.db`, `AUTH_SECRET`, `MAIL_FROM`, `BREVO_API_KEY`. Generate `AUTH_SECRET` with a password manager or `openssl rand -base64 48`, and keep a copy outside Railway.
6. **Networking → Generate domain** (a temporary `*.up.railway.app` address), then **Custom domain** → your final domain. Create the DNS record Railway shows at your registrar (a `CNAME`; for a bare domain the `ALIAS`/`ANAME` or A record it lists). HTTPS is automatic once DNS resolves.
7. Set `NEXT_PUBLIC_SITE_URL` to the **final** domain before the build you go live with.
8. **Settings → Deploy**: confirm start command `npm start`, health check `/api/health`, config from `railway.json`.
9. Deploy. The first start creates `/data/miel.db`, applies the migrations and loads the products, delivery zones and content from `config/*`. The deploy goes live only when `/api/health` returns 200.
10. **Create the owner** (once): Railway → service → **Shell** (or `railway ssh`), then
    ```bash
    npm run create-owner -- --email you@example.com --name "Your Name"
    ```
    It emails a one-time link (valid 48 h). It never accepts, shows or logs a password and refuses to run if an owner exists. Open the link, choose your password, sign in at `/admin/login`, and turn on two-factor in **My account** (save the recovery codes). Everyone else is invited from **Settings → Team**.
11. In the admin: **Inventory** (starting stock; everything starts at 0, so nothing can be sold yet), **Shipping & delivery** (real fees), **Settings → Store details** (real WhatsApp number, notification email).
12. Go-live test (section 8).

## 4. Who can do what

| | Staff | Manager | Owner |
|---|---|---|---|
| Orders, customers, inventory | ✅ | ✅ | ✅ |
| View products | ✅ | ✅ | ✅ |
| Edit products, discounts, shipping, content, marketing, analytics | ❌ | ✅ | ✅ |
| CSV exports | ❌ | ✅ | ✅ |
| Delete (images, testimonials) | ❌ | ❌ | ✅ |
| Settings, team, security, backups | ❌ | ❌ | ✅ |

There is no database-level security: the database file is only reachable from server code, so these checks, made on every page, action and API route (and again at the front door, `proxy.ts`), **are** the access control. A test fails if an action is added without being classified.

## 5. Sign-in, sessions, 2FA

* Email + password (argon2id). Accounts exist only by invitation: the owner enters an email and role, the person gets a single-use link (valid 48 h; only its hash is stored) and chooses their own password. No public sign-up exists anywhere.
* Sessions live in the database; the cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`. They end after **12 hours without activity** (7 days at most). **My account** lists active sessions and has "Sign out everywhere"; changing your password signs your other devices out.
* **Two-factor**: authenticator app (TOTP) with 10 one-time recovery codes. The owner can require it for everyone (**Settings → Security**). Lost phone: use a recovery code, or the owner removes the setup under **Settings → Team → Reset 2FA**.
* Failed logins, resets, invites and wrong 2FA codes are rate limited (stored in the database, they survive restarts) and written to the audit log with hashed emails and IPs. **Settings → Activity** shows logins, role changes, invites, exports, backup downloads and every destructive action.
* Password reset: **Forgot password** emails a one-hour link; using it signs out every old session.

## 6. Backups and restore

* **Nightly** (around 03:00 Beirut, or at once if the last one is older than 24 h) the app takes a consistent snapshot with SQLite's online backup API, checks its integrity, and keeps the **newest 14 plus the newest of each of the last 8 weeks** in `/data/backups`. `/api/health` reports the age of the newest one. **Settings → Backups** shows them and has **Back up now**.
* **Download backup** (owner only, **Settings → Backups**): a zip with the database snapshot and every uploaded image. It holds all customer data: keep it private. Each download is in the audit log.
* **Off-site copy (optional but recommended)**: set `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_KEY` (and `BACKUP_S3_ENDPOINT` for non-AWS storage such as Cloudflare R2 or Backblaze B2). Every nightly backup is encrypted with AES-256-GCM and uploaded as `<prefix>miel-….db.enc`. Without the encryption key nobody, including the bucket owner, can read them. Customer data never goes into git.
* **Restore** (stop the app first so nothing is writing):
  1. Railway → service → scale/stop the deployment (or **Remove** the latest deployment) so it is not running.
  2. Open a shell on the service (the volume must be attached) and run
     ```bash
     npm run restore -- /data/backups/miel-YYYYMMDD-HHMMSS.db --yes
     ```
     It also accepts the `.zip` from "Download backup" (restores the images too) and `.db.enc` off-site files (needs `BACKUP_ENCRYPTION_KEY`). The backup is integrity-checked **before** anything is touched, and the current database is saved first as `backups/pre-restore-<time>.db`.
  3. Start the deployment again and check `/api/health`.
* A copy is also saved automatically before any database migration (`backups/pre-migration-<time>.db`).

## 7. Email (invites, resets, order alerts)

Mail goes through one small adapter. **Missing mail configuration fails loudly in production**: the build and start refuse, invites say "Email isn't set up", nothing is silently skipped.

**Brevo (default):** create a Brevo account, add and verify your sending domain, create an API key (**SMTP & API → API keys**), and set `BREVO_API_KEY` and `MAIL_FROM` (an address on that verified domain).
**SMTP alternative:** `MAIL_PROVIDER=smtp`, `SMTP_URL`, `MAIL_FROM`.

DNS records at your domain registrar so the mail is not marked as spam (Brevo shows the exact values under **Senders, Domains & Dedicated IPs → Domains**):
* **SPF**: a `TXT` record on the domain that includes Brevo (`v=spf1 include:spf.brevo.com ~all`; if you already have an SPF record, add the `include:` to it instead of creating a second one).
* **DKIM**: the `TXT` (or `CNAME`) record Brevo gives you, usually named `brevo1._domainkey`.
* **Brevo code** (`brevo-code:…` TXT) to verify ownership.
* **DMARC** (recommended): `TXT` on `_dmarc` with `v=DMARC1; p=none; rua=mailto:you@your-domain.com`, then tighten later.
Click **Authenticate** in Brevo after the records propagate (minutes to a few hours).

## 8. Go-live test (do this once, on production)

1. `https://your-domain/api/health` shows `{"status":"ok","db":"ok","volume":"writable",…}`.
2. On your phone open the store, add a pouch, check out with your own number. WhatsApp opens with your message; the order shows in **Admin → Orders** as **#1001** within seconds (bell, toast and soft sound) and **Inventory** dropped by one.
3. Move it through the statuses, mark the COD collected, then place and **cancel** a second one: stock is restored.
4. **Settings → Team**: invite someone (the email arrives, the link works once). **Forgot password** works.
5. **Settings → Backups → Back up now**, then **Download backup**.

## 9. If something fails

| Symptom | What to do |
|---|---|
| Deploy fails the health check | Railway keeps the previous deployment running. Open the deploy logs: a missing variable, a failed migration (`Migration … failed and was rolled back`) or a read-only volume is named there. Fix and redeploy; roll back from **Deployments → older deploy → Redeploy** if needed |
| A migration failed | The server refuses to start rather than run on a half-migrated database; the failed migration was rolled back and a copy of the database was saved before it (`/data/backups/pre-migration-…`). Fix the migration, redeploy |
| Volume is full | Delete old exports or enlarge the volume (Railway → Volumes). Check `/data/backups` size: it keeps at most ~22 snapshots |
| Volume lost or corrupted | Create a new volume at `/data`, then restore the newest backup (section 6; use the off-site copy if the local ones are gone). Orders after that backup have to be re-entered from WhatsApp |
| Bad deploy | **Deployments → previous → Redeploy**. Database migrations are forward-only: if a new migration ran, restore the `pre-migration` copy or follow the fix-forward instructions in the release notes |
| Nobody can sign in (lost owner) | In the Railway shell, `npm run create-owner` refuses while an owner exists. Ask another owner to **Reset 2FA / send a reset link**, or restore a backup |
| `/api/health` 503 | The database did not answer or the volume is not writable. Check the Railway volume is attached at `/data` and `DATABASE_PATH` is `/data/miel.db` |
| Emails not arriving | Check `BREVO_API_KEY`, `MAIL_FROM` and the SPF/DKIM status in Brevo; the logs show `email provider refused…` |

## 10. Demo data and order numbering

* Demo rows are identified only by `is_demo = 1`. `npm run purge-demo` is a dry run; `npm run purge-demo -- --confirm` backs every row up to `/backups/<timestamp>/*.csv` and then deletes them. Anything marked demo but linked to a real order is **listed and skipped**. If no orders remain, the counter is reset so the next order is #1001.
* `npm run seed-demo -- --yes` creates fake data for staging only; it refuses to run when `MIEL_ENV` is not `staging` or `development`, or the Railway environment is `production`.

## 11. Quality gate

`npm run verify` = typecheck → lint → unit → integration → production build → end-to-end tests. The integration tests run on a real temporary SQLite database (including 50 concurrent orders against 10 in stock, with exactly 10 succeeding, also across 4 separate processes). The end-to-end tests build the app, start it with `npm start` exactly as Railway does, and use the real storefront and admin in a browser: checkout, live alert, order lifecycle, cancel, discount, manual order, concurrent editing, exports, roles, invites, 2FA, password reset, uploads, backups, health, and the security checks. Not covered automatically: email delivery with your real Brevo account and DNS, and Railway's own network layer: use section 8 after deploying.

## 12. Key rotation

* `AUTH_SECRET` leaked: change it in Railway and redeploy; everyone must re-enrol two-factor (the old secrets can no longer be decrypted), and use "Sign out everywhere".
* `BREVO_API_KEY` leaked: revoke it in Brevo, create a new one, update Railway, redeploy.
* A team member's account compromised: **Settings → Team → Deactivate** (their sessions end immediately), then review **Settings → Activity**.
