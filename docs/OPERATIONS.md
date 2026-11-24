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
| `SITE_MODE` | optional | no | `live` (default) or `maintenance`. In maintenance the public storefront is the 503 "MIEL+ is under development" page and no order can be placed; admin, sign-in, `/api/health` and uploads stay open. Read at runtime: change the variable and restart, no rebuild. Anything else is refused at build and start |
| `MAIL_FROM` | optional until mail is set up | no | sender, e.g. `MIEL+ <orders@your-domain.com>` (a verified sender, see section 7) |
| `BREVO_API_KEY` | optional until mail is set up | **YES** | Brevo API key |
| `MAIL_PROVIDER` | optional | no | `brevo` (default) or `smtp` |
| `SMTP_URL` | when `MAIL_PROVIDER=smtp` (optional) | **YES** | `smtp://user:password@host:587` |
| `STORE_TIMEZONE` | optional | no | defaults to `Asia/Beirut` |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_PREFIX` | optional | key and secret: **YES** | off-site backup bucket (section 6). Keep the encryption key too |
| `BACKUP_ENCRYPTION_KEY` | required when `BACKUP_S3_BUCKET` is set | **YES** | 32+ characters. Encrypts each off-site backup. **Store it somewhere other than Railway**: without it the off-site copies cannot be opened |
| `BACKUPS_DISABLED` | never in production | no | `1` turns off the nightly backups (tests only) |
| `MIGRATIONS_DIR` | optional | no | override the migrations folder (default `./migrations`) |
| `SKIP_ENV_CHECK` | never | no | bypasses the startup check (emergency/CI) |

Railway sets `PORT` and `RAILWAY_ENVIRONMENT_NAME` itself; do not set them. `npm run check-env` checks your environment without printing values. The build and the server **refuse to start** with a clear message when a hosted environment is missing `MIEL_ENV`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_PATH` or `AUTH_SECRET`, when `MIEL_ENV` disagrees with the Railway environment name, or when `SITE_MODE` has a value other than `live`/`maintenance`. **Email is optional until configured** (section 7): the app never fails because of missing mail variables.

## 3. Exact Railway steps (first deploy)

1. Run `npm run verify` locally (everything green).
2. **Railway → New Project → Deploy from GitHub repo**, pick this repository and branch. Name the environment `production`.
3. **Service → Settings → Region**: Europe West (Amsterdam). Replicas: **1** (set in the dashboard; `railway.json` also says 1).
4. **Service → Volumes → New Volume**, mount path **`/data`**. (If the app later reports permission errors writing `/data`, add the variable `RAILWAY_RUN_UID=0`.)
5. **Variables**: add every production variable from section 2: `MIEL_ENV=production`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_PATH=/data/miel.db`, `AUTH_SECRET`, and `SITE_MODE=maintenance` while the shop is not ready (see "Before launch"). Mail variables can wait. Generate `AUTH_SECRET` with a password manager or `openssl rand -base64 48`, and keep a copy outside Railway.
6. **Networking → Generate domain** (a temporary `*.up.railway.app` address), then **Custom domain** → your final domain. Create the DNS record Railway shows at your registrar (a `CNAME`; for a bare domain the `ALIAS`/`ANAME` or A record it lists). HTTPS is automatic once DNS resolves.
7. Set `NEXT_PUBLIC_SITE_URL` to the **final** domain before the build you go live with.
8. **Settings → Deploy**: confirm start command `npm start`, health check `/api/health`, config from `railway.json`.
9. Deploy. The first start creates `/data/miel.db`, applies the migrations and loads the products, delivery zones and content from `config/*`. The deploy goes live only when `/api/health` returns 200.
10. **Create the owner** (once): Railway → service → **Shell** (or `railway ssh`), then
    ```bash
    npm run create-owner -- --email you@example.com --name "Your Name"
    ```
    It emails a one-time link (valid 48 h). **With no email configured it prints the one-time link in the terminal instead** (a link, never a password), and you open it yourself. It never accepts, shows or logs a password. Open the link, choose your password, sign in at `/admin/login`, and turn on two-factor in **My account** (save the recovery codes). Everyone else is invited from **Settings → Team**.
11. In the admin: **Inventory** (starting stock; everything starts at 0, so nothing can be sold yet), **Shipping & delivery** (real fees), **Settings → Store details** (real WhatsApp number, notification email).
12. Work through "Before launch" (section 8), then the go-live test (section 9).

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

### Adding team members: two ways (owner only)

**1. Add member (direct, works without email).** **Settings → Team → Add member**: name, email, role (staff or manager; owner needs you to type `CREATE OWNER` to confirm). The account is **active immediately** with a **generated temporary password** (20 random characters) shown **once** on screen with a Copy password button and a warning that it will not be shown again. You never type or choose it, and only its argon2id hash is stored. Hand it over in person or through a private channel. What the member must do:

1. **First sign-in:** they enter their email and the temporary password, and are taken to **Choose your own password** (12+ characters, letters and numbers, different from the temporary one). Until they do, no admin page, action or API opens for them (and they cannot preview the hidden storefront). Their other sessions end when they save.
2. **Then two-factor enrolment is forced** (authenticator app plus 10 recovery codes), even if you have not required 2FA for everyone. Again nothing else opens until it is done.
3. After that they are a normal member: password, then authenticator code at every sign-in, 12-hour idle timeout, their role's permissions.

The temporary password **expires after 48 hours if unused**: sign-in then fails with the usual "Wrong email or password." On **Settings → Team** a member who has not chosen a password yet shows "Temporary password pending" (or "expired") and a **Regenerate temporary password** button: it makes a new one, kills the old one and every session of that person, and is shown once again. Regenerating is not offered for members who already chose their own password (use **Send reset link** for those). Creating members and regenerating passwords share a limit of 10 per hour per owner. Every creation and regeneration is in **Settings → Activity** (who, whom, role, time; never the password). Nobody can give a role higher than their own, and only the owner can add members.

**2. Invite (by email or link).** Unchanged: the person gets a single-use link (48 h), chooses their own password and signs in; with email not configured the owner copies the link from the screen. Use it when you would rather never see a password at all.

* Email + password (argon2id). Accounts exist only when the owner creates them, in one of two ways (below): an invitation link, or Add member with a temporary password. No public sign-up exists anywhere.
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

Mail goes through one small adapter, and **email is optional until you configure it**. With no mail variables set:

* the app builds, starts and serves normally; `/api/health` stays 200 and reports `"mail": "not_configured"`; the server logs one startup warning (no secrets);
* every skipped message is recorded in the audit log as `email_not_sent` (subject only: no address, no body);
* the admin shows the banner **"Email is not configured yet"**;
* **invites and password resets show a copyable one-time link** to the owner (Settings → Team) to hand over by WhatsApp or in person. The link is shown once, works once, and only its hash is stored. **Forgot password** tells people to ask the owner;
* new-order alert emails are skipped without errors.

A mail provider that IS configured but fails (rejected key, network) is still an error, never silent. As soon as you add the variables below and redeploy, everything is emailed automatically and the banner disappears.

**Brevo (default):** create a Brevo account, add and verify your sending domain, create an API key (**SMTP & API → API keys**), and set `BREVO_API_KEY` and `MAIL_FROM` (an address on that verified domain).
**SMTP alternative:** `MAIL_PROVIDER=smtp`, `SMTP_URL`, `MAIL_FROM`.

DNS records at your domain registrar so the mail is not marked as spam (Brevo shows the exact values under **Senders, Domains & Dedicated IPs → Domains**):
* **SPF**: a `TXT` record on the domain that includes Brevo (`v=spf1 include:spf.brevo.com ~all`; if you already have an SPF record, add the `include:` to it instead of creating a second one).
* **DKIM**: the `TXT` (or `CNAME`) record Brevo gives you, usually named `brevo1._domainkey`.
* **Brevo code** (`brevo-code:…` TXT) to verify ownership.
* **DMARC** (recommended): `TXT` on `_dmarc` with `v=DMARC1; p=none; rua=mailto:you@your-domain.com`, then tighten later.
Click **Authenticate** in Brevo after the records propagate (minutes to a few hours).

## 8. Before launch (checklist)

While the shop is not ready, deploy with `SITE_MODE=maintenance`: visitors see "MIEL+ is under development" (HTTP 503, not indexable, `robots.txt` disallows everything), no order can be placed, and you work in `/admin` normally. The admin shows "Storefront is hidden from the public. Set SITE_MODE=live to launch."

When you are ready to launch, in this order:

- [ ] **Domain**: custom domain added in Railway, DNS record created, HTTPS active, and `NEXT_PUBLIC_SITE_URL` is the final `https://` domain (redeploy if you changed it).
- [ ] **Products and stock**: **Inventory** has real starting stock, **Shipping & delivery** has real fees, **Settings → Store details** has your real WhatsApp number, policy texts are written.
- [ ] **Owner and team**: owner account created, two-factor on (recovery codes saved), teammates invited.
- [ ] **Email** (recommended before launch, not required): `MAIL_FROM` + `BREVO_API_KEY` (or SMTP) set, the sending domain verified in Brevo, **SPF**, **DKIM** (and DMARC) records added at your DNS provider and shown as authenticated (section 7). The "Email is not configured yet" banner disappears after the redeploy.
- [ ] **Backups**: **Back up now** works, off-site copy configured if you want one.
- [ ] **Test order** in maintenance mode: place it by hand from **Admin → Orders → New order** (the public checkout is closed), move it through the statuses, cancel it, check stock came back.
- [ ] **Set `SITE_MODE=live`** (or delete the variable) in Railway and restart. The storefront opens; the admin banner disappears.
- [ ] **Go-live test** on the public site (next section), then cancel the test order.

**Previewing the hidden storefront:** while `SITE_MODE=maintenance`, sign in at `/admin/login` (any role) and open the site address in the same browser: you see the real storefront, cart and checkout, with a bar "Preview mode: only you can see this." on every page. Visitors and anyone signed out still get the under-development page. No real order can be placed by anyone. As an admin you can place a clearly marked **TEST order** only: the checkout button says PLACE TEST ORDER and stays disabled until you tick "This is a test order". A test order takes real stock (cancel it in **Admin → Orders** to put it back), shows a TEST badge, is not counted in sales or statistics, and sends nothing to WhatsApp or email. The site tracking and abandoned-checkout capture stay off in preview.

To take the shop offline again at any time: set `SITE_MODE=maintenance` and restart. Orders already placed are untouched.

## 9. Go-live test (do this once, on production)

1. `https://your-domain/api/health` shows `{"status":"ok","db":"ok","volume":"writable",…}`.
2. On your phone open the store, add a pouch, check out with your own number. WhatsApp opens with your message; the order shows in **Admin → Orders** as **#1001** within seconds (bell, toast and soft sound) and **Inventory** dropped by one.
3. Move it through the statuses, mark the COD collected, then place and **cancel** a second one: stock is restored.
4. **Settings → Team**: invite someone (the email arrives, or, with no email set up yet, copy the one-time link; it works once). **Forgot password** works once email is configured.
5. **Settings → Backups → Back up now**, then **Download backup**.

## 10. If something fails

| Symptom | What to do |
|---|---|
| Deploy fails the health check | Railway keeps the previous deployment running. Open the deploy logs: a missing variable, a failed migration (`Migration … failed and was rolled back`) or a read-only volume is named there. Fix and redeploy; roll back from **Deployments → older deploy → Redeploy** if needed |
| A migration failed | The server refuses to start rather than run on a half-migrated database; the failed migration was rolled back and a copy of the database was saved before it (`/data/backups/pre-migration-…`). Fix the migration, redeploy |
| Volume is full | Delete old exports or enlarge the volume (Railway → Volumes). Check `/data/backups` size: it keeps at most ~22 snapshots |
| Volume lost or corrupted | Create a new volume at `/data`, then restore the newest backup (section 6; use the off-site copy if the local ones are gone). Orders after that backup have to be re-entered from WhatsApp |
| Bad deploy | **Deployments → previous → Redeploy**. Database migrations are forward-only: if a new migration ran, restore the `pre-migration` copy or follow the fix-forward instructions in the release notes |
| Nobody can sign in (lost owner) | In the Railway shell, `npm run create-owner` refuses while an owner exists. Ask another owner to **Reset 2FA / send a reset link**, or restore a backup |
| `/api/health` 503 | The database did not answer or the volume is not writable. Check the Railway volume is attached at `/data` and `DATABASE_PATH` is `/data/miel.db` |
| Emails not arriving | First check the admin banner: "Email is not configured yet" means no mail variables are set (links are shown in the admin instead). Otherwise check `BREVO_API_KEY`, `MAIL_FROM` and the SPF/DKIM status in Brevo; the logs show `email provider refused…` |
| The public site shows "under development" and you did not expect it | `SITE_MODE=maintenance` is set in Railway. Set it to `live` (or delete it) and restart |

## 11. Demo data and order numbering

* Demo rows are identified only by `is_demo = 1`. `npm run purge-demo` is a dry run; `npm run purge-demo -- --confirm` backs every row up to `/backups/<timestamp>/*.csv` and then deletes them. Anything marked demo but linked to a real order is **listed and skipped**. If no orders remain, the counter is reset so the next order is #1001.
* `npm run seed-demo -- --yes` creates fake data for staging only; it refuses to run when `MIEL_ENV` is not `staging` or `development`, or the Railway environment is `production`.

## 12. Quality gate

`npm run verify` = typecheck → lint → unit → integration → production build → end-to-end tests. The integration tests run on a real temporary SQLite database (including 50 concurrent orders against 10 in stock, with exactly 10 succeeding, also across 4 separate processes). The end-to-end tests build the app, start it with `npm start` exactly as Railway does, and use the real storefront and admin in a browser: checkout, live alert, order lifecycle, cancel, discount, manual order, concurrent editing, exports, roles, invites, 2FA, password reset, uploads, backups, health, and the security checks. Not covered automatically: email delivery with your real Brevo account and DNS, and Railway's own network layer: use the go-live test (section 9) after deploying.

## 13. Key rotation

* `AUTH_SECRET` leaked: change it in Railway and redeploy; everyone must re-enrol two-factor (the old secrets can no longer be decrypted), and use "Sign out everywhere".
* `BREVO_API_KEY` leaked: revoke it in Brevo, create a new one, update Railway, redeploy.
* A team member's account compromised: **Settings → Team → Deactivate** (their sessions end immediately), then review **Settings → Activity**.

## 14. Product photos

All three flavours have the same four-photo gallery (pouch hero, flat lay, sachet open, ingredients). The pipeline, for a new or replaced photo:

1. Put the big original (4:5 portrait PNG/JPG) in `./incoming-images/` (git-ignored: 25 MB originals are never committed).
2. `node scripts/ingest-image.mjs incoming-images/<file> <slug> <slug>-<kind>`, for example `... gold gold-flat-lay`. This writes the source `assets-src/<slug>/<name>.webp` (2000 px tall, like the RED BURN sources, a few hundred KB).
3. `npm run images` makes AVIF + WebP at 480/768/1080/1600 (never upscaled), the blur placeholders (`config/photos.generated.ts`) and keeps explicit width/height. It does not change the other products' files.
4. List the photo in the product's `images` array in `config/products.ts` (order: pouch-hero, flat-lay, sachet-open, ingredients; each with a specific alt text that describes only what is visible).
5. Delete `./incoming-images/`.

An **existing** database picks up photos and glow colours added to `config/products.ts` once, at the next start, only for a product that has no photos yet (and only if its glow colour was never changed). After that the admin owns them: a photo you delete or reorder never comes back. A new database gets everything when it is first created.

**TODO(gold-flat-lay): swap in the corrected GOLD flat lay.** The supplied GOLD flat-lay photo has a typo on the pouch ("21 C EACH" instead of "21 G EACH"), so it is **not published**; the GOLD gallery's flat-lay slot shows the pouch hero instead (label "POUCH"). When the corrected photo is ready: run steps 1 to 3 with `gold gold-flat-lay`, change that slot in `config/products.ts` to `src: "/images/products/gold/gold-flat-lay"`, label `FLAT LAY` and an alt text describing the flat lay, remove the `TODO(gold-flat-lay)` comments, and in the admin (**Products → GOLD → images**) replace the duplicate pouch-hero entry with the new photo (existing databases keep what the admin shows).

## 15. Influencer affiliates

Admin: **Marketing → Affiliates** (`/admin/affiliates`, owner and manager). Public: `/ambassadors` (apply) and `/partner/<private link>` (read-only stats for one affiliate).

- **Nothing to set up.** The tables arrive with migration `0005_affiliates.sql` at the next boot (additive: no order is touched). There are no new environment variables and no scheduled job.
- **Rules live in `config/affiliates.ts`:** defaults (15% commission, 10% off for followers), tier thresholds (Athlete at 10 delivered orders, Ambassador at 30) and the tier commission rates, and the 14-day approval delay. The Athlete (20%) and Ambassador (25%) rates are placeholders for you to confirm; change them there. An upgrade only changes orders placed afterwards.
- **A code** is uppercase letters and numbers (3 to 20), unique, and shares one namespace with discount codes. At checkout it is case-insensitive, valid only while the affiliate is **active**, one code per order, and an affiliate cannot use their own code (same phone number). Discount = % of the products subtotal; commission = % of the discounted products subtotal; delivery is never included.
- **Commission lifecycle:** `pending` at checkout → `approved` 14 days after the order is **delivered** (applied automatically whenever an affiliate page is opened or a payout is recorded) → `paid` when included in a payout. `void` when the order is cancelled or returned. A commission that was already paid is never changed afterwards.
- **Record payout** (affiliate page) pays every approved, unpaid commission of that affiliate in one step and keeps the payout history. Pay the person yourself (Whish, cash, bank), then record it.
- **Private stats link:** each affiliate has a random link (`/partner/...`) shown on their page in the admin. Anyone with the link can see their numbers (no customer data), so send it to them privately. It is not indexed and is disallowed in `robots.txt`.
- **Applications:** `/ambassadors` stores to the Applications inbox (honeypot, minimum fill time, 3 per hour per connection, duplicate handle check). Approving creates an affiliate with a generated code you can change.
- **Export:** Affiliates page → Monthly export → CSV of that month's affiliate orders and commissions (owner and manager).

### Affiliates in the admin (menu, pages, personal link)
- **Menu:** "Affiliates" sits right after Orders (owner and manager). It has four pages: Overview (`/admin/affiliates`: sales, commission pending / approved / paid, top 5 this month), Affiliates (`/admin/affiliates/list`: search, status filter, Add affiliate), Payouts (`/admin/affiliates/payouts`, with a CSV by month) and Applications (`/admin/affiliates/applications`, with the number of new ones as a badge here and on the menu item). An affiliate's own page is `/admin/affiliates/<id>`.
- **Personal link:** each affiliate page shows the code and a link `https://<your domain>/?ref=CODE` (the domain comes from `NEXT_PUBLIC_SITE_URL`). Opening it remembers the code for 30 days and fills the discount field at checkout; the server still checks it exactly as if it had been typed (active affiliate, valid code).
- **Orders:** the Orders list shows the affiliate, code, discount and commission with its status, can be filtered by affiliate, and the CSV has those columns.

## 16. Ambassador program

**Public:** `/ambassadors` (program page + application form with terms), `/ambassadors/terms`, an optional banner on the home page (Ambassadors > Settings). **Private portal:** `/ambassador/login` (the old `/partner/<token>` links redirect there). The portal is noindex, never cached and disallowed in robots.

**Approve and invite (Ambassadors > Applications):** "Approve and send invite" creates the account, a starter-kit request and a 7-day one-use invite link. The admin shows the link with a Copy button and a "Send on WhatsApp" link (pre-filled message). Email is sent only if mail is configured (`MAIL_FROM` + `BREVO_API_KEY` or `SMTP_URL`); otherwise it is skipped silently and you send the link yourself. The ambassador sets a password (12+ characters) and accepts the terms (version and time are stored). Forgot password: open the ambassador's page and press "Password reset link" (valid 24 hours, one use), then send it to them.

**Settings (Ambassadors > Settings, owner and manager):** level names, delivered-order thresholds, commission rates, perks, follower discount (applies to NEW ambassadors), hold period (days after delivery before a commission is approved), minimum payout (default $20), automatic level upgrades (off by default: the ambassador page shows an Upgrade button), home banner and the terms text. Saving changed terms raises the version and every ambassador must accept again at their next login. **Have a lawyer review the terms text before you rely on it.**

**Money flow:** an order placed with a code or personal link stores the ambassador, the source (code/link), the discount and the commission (a percentage of the discounted PRODUCTS subtotal, delivery excluded). The commission is pending, approved `hold` days after delivery, void when the order is cancelled/refused/returned, and paid by a payout. Mission bonuses are approved by the team and paid with the next payout. An ambassador asks for a payout from the portal when their available balance reaches the minimum and payout details are on file; the team pays on the ambassador's page ("Record payout"), which marks the request paid and notifies them. A request can be declined with a reason.

**Missions, kits, content:** Missions (create, end, review proofs: approve credits the reward, reject needs a note), Kits (starter kits and the monthly free pouch for Athlete and above: requested, shipped, delivered), Content (resources: files or links; announcements: each notifies every ambassador), Reports (sales by ambassador and month, CSV).

**Privacy:** an ambassador sees only their own data; customers appear as FIRST NAME only, no phone, address or email. Link visits are a daily count per ambassador with no IP or cookie id. Proof screenshots are stored on the volume (`/data/ambassador/proofs`) and served only to the owner and the team.

**Launch checklist:** set `SITE_MODE=live` when you open the store; configure email if you want invites mailed; review terms, rates, perks and the minimum payout in Settings.
