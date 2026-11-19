# MIEL+ reliability and QA audit

Branch `qa-audit`. Scope: the admin and the storefront, tested as a production build on a throwaway SQLite database that mimics the Railway volume (separate folder for the database, uploads and backups), seeded with realistic fake data: **200 products** (singles, bundles, draft and archived), **2,000 customers**, **5,000 orders** (about 10,000 order lines, 9,500 timeline events, 11,800 stock movements), 20 discounts. No real data, credentials or secrets were used; test accounts only exist in the throwaway database (`tests/support/e2e-env.ts`).

Reproduce the data set: `npx tsx --conditions=react-server tests/support/qa-seed.ts <folder>` (see `tests/support/qa-seed.ts`).

## Findings

Severity: **High** = wrong data or a crash a customer or the team would hit; **Medium** = slow or confusing under real load; **Low** = polish or hardening.

| # | Finding | Severity | Status | Test that proves it |
|---|---------|----------|--------|---------------------|
| 1 | Customers page compared every customer with every order in JavaScript: 1.8 s and a 10.4 MB page at 2,000 customers / 5,000 orders | High | Fixed (one SQL aggregate, 50 per page: 0.27 s, 288 KB) | `tests/integration/qa-performance.test.ts` (customers, customers searched, page size cap) |
| 2 | Products, inventory and discounts pages loaded every row (no pagination, no search); the discounts page rendered an edit form for every discount (2.8 MB) | High | Fixed (25 per page, search, stock filter, only the discount being edited renders its form; pager component) | `qa-performance.test.ts` (products, inventory, inventory low stock, discounts), `empty-state.test.ts` |
| 3 | Home page listed every product (200 cards) | Medium | Fixed (first 12, "See all" link, paginated `/products`, added to the sitemap) | `tests/e2e/pages.spec.ts`, `product-images.spec.ts` |
| 4 | "COD pending" order filter was applied after pagination, so pages were short or empty | Medium | Fixed (filter in SQL) | `qa-performance.test.ts` (orders, COD pending) |
| 5 | Missing indexes for region/date, discount code, COD settlement, partner COD, stock movements, abandoned checkouts, customer name, product status | Medium | Fixed (`migrations/0004_qa_indexes.sql`) | `qa-performance.test.ts` (query plans use an index), `qa-persistence.test.ts` (migration is idempotent) |
| 6 | Two admin tabs editing the same order status, delivery, COD, discount, shipping zone, delivery partner or customer silently overwrote each other (only products were version-checked) | High | Fixed (hidden `version` field on every form, `ifVersion` on save, "Someone else changed this record" message, nothing is overwritten) | `tests/integration/qa-ledger-locks.test.ts` (two-tab tests) |
| 7 | A save with a stale or unknown id threw a raw database message ("violates foreign key constraint", "JSON object requested, multiple (or no) rows returned") at the user | Medium | Fixed (`friendly()` wording, five actions wrapped so they return a message instead of crashing) | `tests/integration/qa-action-fuzz.test.ts` (every action, hostile input) |
| 8 | The live refresh only covered the dashboard, orders and inventory, and only for orders and stock. Product, discount, shipping, customer and settings changes needed a manual refresh | Medium | Fixed (every audited change publishes a live event; every dashboard and list refreshes; edit pages are never refreshed so nobody loses typing) | `tests/integration/live-events.test.ts`, `tests/unit/live-sync.test.ts`, `tests/e2e/qa-live.spec.ts` |
| 9 | Admin controls under 48 px on a phone (section tabs, dashboard period buttons, status rows, table action buttons, CSV links, the order checkboxes, the order quantity box, the logo link) | Medium | Fixed (all at least 48 px; checkboxes through a 48 px label) | `tests/e2e/pages.spec.ts` (tap-target check at 375 px on every admin page) |
| 10 | No custom error pages: an unexpected failure showed the framework's default screen | Low | Fixed (`app/error.tsx`, `app/admin/error.tsx`, `app/global-error.tsx`: calm message, reference code only, never a stack trace) | `tests/e2e/qa-live.spec.ts` (no stack trace in a failing response) |
| 12 | The first version of the home-page cap exported its constant from a client component; a server component received a reference instead of a number and the home lineup rendered EMPTY in the production build (caught by the full run) | High | Fixed (constant moved to `lib/lineup.ts`) | `tests/unit/lineup-limit.test.ts`, `tests/e2e/product-images.spec.ts`, `flows.spec.ts` |
| 11 | Stock ledger had no machine check | Low | Fixed (`lib/ledger.ts` `checkLedger()`: on-hand equals the sum of movements for every item) | `qa-ledger-locks.test.ts`, `qa-persistence.test.ts`, `qa-performance.test.ts` |

## Verified, no defect found

| Area | What was proven | Test |
|------|-----------------|------|
| Stock under concurrency | 12 parallel checkouts for the last unit: exactly one succeeds, stock ends at 0, ledger balances. Also 50 concurrent orders for 10 units, and 4 separate processes on one file | `qa-ledger-locks.test.ts`, `orders-concurrency.test.ts` |
| Double submit | Same idempotency key twice returns the same order and takes stock once | `qa-ledger-locks.test.ts`, `orders-concurrency.test.ts` |
| Cancel / return | Cancel, repeated cancel and return restore stock exactly once; a failed multi-line order leaves no stock or ledger trace | `qa-ledger-locks.test.ts` |
| Restart and migrations | App restarted four times and migrations re-run: nothing applied twice, no record lost or duplicated, integrity check ok, ledger balanced | `qa-persistence.test.ts` |
| Backup and restore | Backup of the large database restored into a fresh folder: every table has the same record count, integrity ok, ledger balanced | `qa-persistence.test.ts`, `backup.test.ts` |
| Live alerts | Order made in one tab appears in another tab's list without a reload; with the stream blocked the bell still updates by polling (30 s); after a real server restart the browser reconnects and catches up | `tests/e2e/qa-live.spec.ts` |
| Roles | Owner, manager and staff against every admin page and every API route (exports, backup download, notifications, search), including direct calls; 401 without a session; every server action classified | `qa-security-matrix.test.ts`, `auth-gates.test.ts`, `proxy.test.ts` |
| Data leaks | No password hash, 2FA secret, recovery code, temp password or secret name in any admin page or API response; search never returns team accounts | `qa-security-matrix.test.ts`, `tests/e2e/build-security.spec.ts` |
| CSRF | Session cookie is HttpOnly and SameSite; a forged cross-origin server-action call is refused and changes nothing | `tests/e2e/qa-live.spec.ts` |
| Logs | No secret, password or hash appears in the server log | `tests/e2e/qa-live.spec.ts` |
| Sessions, 2FA, rate limits, one-time links | Idle timeout, 2FA login and recovery codes, throttling, single-use invites and resets | `auth.test.ts`, `admin-security.spec.ts`, `add-member.spec.ts` |
| Production behavior | Health states (200, 503 with no detail on a broken database or unwritable volume), maintenance mode rules, mail not configured | `health.test.ts`, `maintenance.test.ts`, `no-mail.test.ts`, `maintenance.spec.ts` |
| Action robustness | Every admin server action with empty and hostile input (SQL, script tags, huge strings, control characters): a clean message, never a raw error | `qa-action-fuzz.test.ts` |

## Performance (5,000 orders, 2,000 customers, 200 products, production build)

Server-rendered page times, measured before and after:

| Page | Before | After |
|------|--------|-------|
| Customers | 1.8 s, 10.4 MB | 0.27 s, 288 KB |
| Products, inventory, orders, home | not paginated or slow | 0.24 to 0.25 s |
| Discounts | 2.8 MB | small page, one edit form |
| Dashboard, analytics | about 0.5 s | about 0.5 s |

At 375 px every admin page loads and is usable well under 2 seconds on this data. Budgets are enforced by `qa-performance.test.ts` (800 ms per list, 1.5 s for the dashboard and analytics, 450 KB per page) and the query plans must use an index.

## Full suite

`npm run verify` passes: typecheck, lint (zero warnings), 135 unit tests, 269 integration tests on real SQLite, production build, 130 end-to-end tests on the production build.

## What remains

- **Lighthouse scores** were not run in this environment (no Lighthouse installed, and the admin needs a signed-in session). Server timings above and the 375 px page checks stand in for it; run Lighthouse on the live admin after deploy.
- **Settings and page-content forms** (store details, policies, announcement, hero, FAQ) are single-row records saved by the owner; they do not yet carry the stale-save check that orders, discounts, zones, partners, customers and products have. Low risk (one owner, a full-form overwrite of text), listed for a later pass.
- **`scripts/purge-demo.ts`** updates stock directly, without a stock movement. It only touches demo rows on staging and refuses production, but after a purge the ledger of those items needs the same adjustment; not changed because it is a staging-only tool.
- **One instance only**: the live alert bus is in the app process, as documented in `lib/events.ts`. With more than one replica the bell would only see events from its own instance (polling would still catch up within 30 s).
