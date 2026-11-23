# MIEL+ admin QA report

Branch `admin-qa`. A page that was not tested is marked **NOT TESTED**, never PASS. Sections between `BEGIN` / `END` markers are generated from the raw results of the last QA run by `npx tsx tests/qa/make-report.ts`; everything else is written by hand.

<!-- BEGIN:summary -->
## Summary

**Result: every admin page, route and action in the inventory was visited or exercised, and the final run is green.** Final state: `npm run verify` passes (160 unit, 348 integration, 142 end-to-end tests) and the dedicated admin QA (`npm run qa:admin`, 22 tests) passes. The admin QA found real bugs along the way; they are listed with their proof in section 4 and all but the items under "Remaining" are fixed.

| What | Result |
|---|---|
| Pages crawled (admin, flow and public pages, with variants) | 39 targets x 2 viewports = 78 page loads, **78 PASS**, 0 console errors or warnings, 0 failed requests, no overflow, all tap targets at least 48px and text at least 13px on the phone |
| Interactions (search, filters, sort, pagination, exports, bell, menus, validation, empty and error states, bulk action) | 58 recorded, **58 PASS** |
| On-screen numbers compared with independent SQL | 457 checks, **457 equal** (orders, customers, products, inventory, discounts, dashboard, all 20 affiliates in the admin and on their partner pages, overview cards, top five, payout history, monthly CSV) |
| Live updates and two-tab scenarios | 7 of 7 PASS (application on dashboard and bell via SSE, polling fallback, new order on the dashboard, one payout from two tabs, edit conflict, application double-click) |
| Permission matrix over real HTTP (logged out, staff, manager, owner, every page and route, no UI) | 137 of 137 PASS |
| Mobile performance (375px, 4x CPU, 1.6 Mbit/s, 150 ms) | 25 of 25 pages under the 2000 ms target; slowest 1940 ms (an estimate, see section 3) |

Data set: production build, temporary SQLite in a temp folder (database, uploads and backups folders like the Railway volume), 3 real flavours plus 37 extra products, 2,000 customers, 3,000 orders in every status, stock lots with expiry dates, 20 affiliates (all tiers, active / paused / ended), 500 affiliate orders, 28 payouts (some with corrections), 40 applications. Fake data and throwaway accounts only, a random secret per run that is never printed, mail written to a local file, no outside service contacted. Screenshots: `./qa-screenshots/<desktop|phone>/` (not committed).
<!-- END:summary -->

## 1. Inventory (step 1)

Walked from the route tree by `tests/support/qa-inventory.ts` (`npx tsx tests/support/qa-inventory.ts`). A ticked box means at least one test visited the page (or, for routes and actions, mentions it). Unticked = **NOT TESTED**.

<!-- BEGIN:inventory -->
### Admin pages (29)
- [x] `/admin`
- [x] `/admin/account`
- [x] `/admin/affiliates`
- [x] `/admin/affiliates/[id]`
- [x] `/admin/affiliates/applications`
- [x] `/admin/affiliates/new`
- [x] `/admin/analytics`
- [x] `/admin/change-password`
- [x] `/admin/customers`
- [x] `/admin/customers/[id]`
- [x] `/admin/forgot`
- [x] `/admin/inventory`
- [x] `/admin/login`
- [x] `/admin/marketing`
- [x] `/admin/marketing/content`
- [x] `/admin/marketing/discounts`
- [x] `/admin/mfa`
- [x] `/admin/orders`
- [x] `/admin/orders/[id]`
- [x] `/admin/orders/new`
- [x] `/admin/print`
- [x] `/admin/products`
- [x] `/admin/products/[id]`
- [x] `/admin/products/new`
- [x] `/admin/set-password`
- [x] `/admin/settings`
- [x] `/admin/settings/activity`
- [x] `/admin/settings/shipping`
- [x] `/admin/settings/team`

### Public pages (7)
- [x] `/`
- [x] `/ambassadors`
- [x] `/maintenance`
- [x] `/partner/[token]`
- [x] `/policies/[slug]`
- [x] `/products`
- [x] `/products/[slug]`

### API and file routes (11)
- [x] `/admin/affiliates/export`
- [x] `/admin/analytics/export`
- [x] `/admin/api/events`
- [x] `/admin/api/notifications`
- [x] `/admin/api/search`
- [x] `/admin/backup/download`
- [x] `/admin/customers/export`
- [x] `/admin/orders/export`
- [x] `/api/health`
- [x] `/api/track`
- [x] `/uploads/[file]`

### Server actions (69)
- [x] `applyAction` (app/actions/ambassadors.ts)
- [x] `quoteAction` (app/actions/checkout.ts)
- [x] `placeOrder` (app/actions/checkout.ts)
- [x] `captureCheckout` (app/actions/checkout.ts)
- [x] `changePassword` (app/admin/(app)/account/actions.ts)
- [x] `revokeSession` (app/admin/(app)/account/actions.ts)
- [x] `saveAffiliate` (app/admin/(app)/affiliates/actions.ts)
- [x] `suggestCode` (app/admin/(app)/affiliates/actions.ts)
- [x] `upgradeTierAction` (app/admin/(app)/affiliates/actions.ts)
- [x] `recordPayoutAction` (app/admin/(app)/affiliates/actions.ts)
- [x] `approveApplicationAction` (app/admin/(app)/affiliates/actions.ts)
- [x] `rejectApplicationAction` (app/admin/(app)/affiliates/actions.ts)
- [x] `saveCustomer` (app/admin/(app)/customers/actions.ts)
- [x] `toggleBlock` (app/admin/(app)/customers/actions.ts)
- [x] `adjustStock` (app/admin/(app)/inventory/actions.ts)
- [x] `setThreshold` (app/admin/(app)/inventory/actions.ts)
- [x] `addBatch` (app/admin/(app)/inventory/actions.ts)
- [x] `receiveBatch` (app/admin/(app)/inventory/actions.ts)
- [x] `saveDiscount` (app/admin/(app)/marketing/actions.ts)
- [x] `toggleDiscount` (app/admin/(app)/marketing/actions.ts)
- [x] `markContacted` (app/admin/(app)/marketing/actions.ts)
- [x] `saveTracking` (app/admin/(app)/marketing/actions.ts)
- [x] `saveAnnouncement` (app/admin/(app)/marketing/actions.ts)
- [x] `saveHero` (app/admin/(app)/marketing/actions.ts)
- [x] `saveFaq` (app/admin/(app)/marketing/actions.ts)
- [x] `addTestimonial` (app/admin/(app)/marketing/actions.ts)
- [x] `setTestimonial` (app/admin/(app)/marketing/actions.ts)
- [x] `changeStatus` (app/admin/(app)/orders/actions.ts)
- [x] `bulkStatus` (app/admin/(app)/orders/actions.ts)
- [x] `toggleCod` (app/admin/(app)/orders/actions.ts)
- [x] `saveDelivery` (app/admin/(app)/orders/actions.ts)
- [x] `addComment` (app/admin/(app)/orders/actions.ts)
- [x] `cancelOrder` (app/admin/(app)/orders/actions.ts)
- [x] `returnOrder` (app/admin/(app)/orders/actions.ts)
- [x] `createManualOrder` (app/admin/(app)/orders/actions.ts)
- [x] `saveProduct` (app/admin/(app)/products/actions.ts)
- [x] `archiveProduct` (app/admin/(app)/products/actions.ts)
- [x] `uploadImage` (app/admin/(app)/products/actions.ts)
- [x] `updateImage` (app/admin/(app)/products/actions.ts)
- [x] `moveImage` (app/admin/(app)/products/actions.ts)
- [x] `deleteImage` (app/admin/(app)/products/actions.ts)
- [x] `seedStoreAction` (app/admin/(app)/settings/actions.ts)
- [x] `backupNow` (app/admin/(app)/settings/actions.ts)
- [x] `saveStore` (app/admin/(app)/settings/actions.ts)
- [x] `saveNotifications` (app/admin/(app)/settings/actions.ts)
- [x] `savePolicies` (app/admin/(app)/settings/actions.ts)
- [x] `saveSecurity` (app/admin/(app)/settings/actions.ts)
- [x] `saveZone` (app/admin/(app)/settings/shipping/actions.ts)
- [x] `savePartner` (app/admin/(app)/settings/shipping/actions.ts)
- [x] `settlePartner` (app/admin/(app)/settings/shipping/actions.ts)
- [x] `inviteMember` (app/admin/(app)/settings/team/actions.ts)
- [x] `cancelInvite` (app/admin/(app)/settings/team/actions.ts)
- [x] `setRole` (app/admin/(app)/settings/team/actions.ts)
- [x] `setActive` (app/admin/(app)/settings/team/actions.ts)
- [x] `sendReset` (app/admin/(app)/settings/team/actions.ts)
- [x] `resetMfa` (app/admin/(app)/settings/team/actions.ts)
- [x] `addMember` (app/admin/(app)/settings/team/actions.ts)
- [x] `regenerateTemporaryPasswordAction` (app/admin/(app)/settings/team/actions.ts)
- [x] `forceChangePassword` (app/admin/(flow)/change-password/actions.ts)
- [x] `startEnroll` (app/admin/(flow)/mfa/actions.ts)
- [x] `finishEnroll` (app/admin/(flow)/mfa/actions.ts)
- [x] `verifyLogin` (app/admin/(flow)/mfa/actions.ts)
- [x] `regenerateRecoveryCodes` (app/admin/(flow)/mfa/actions.ts)
- [x] `disableMfa` (app/admin/(flow)/mfa/actions.ts)
- [x] `setPassword` (app/admin/(flow)/set-password/actions.ts)
- [x] `login` (app/admin/login/actions.ts)
- [x] `logout` (app/admin/login/actions.ts)
- [x] `logoutEverywhere` (app/admin/login/actions.ts)
- [x] `requestReset` (app/admin/login/actions.ts)
<!-- END:inventory -->

## 2. Every page, desktop and phone (step 2)

<!-- BEGIN:pages -->
#### Admin pages
| Page | Desktop 1440px | Phone 375px | Console errors + failed requests | Load ms (desktop) | Phone interactive est. ms | Notes |
|---|---|---|---|---|---|---|
| `/admin` | PASS | PASS | 0 | 190 | 1882 |  |
| `/admin/account` | PASS | PASS | 0 | 47 | 1865 |  |
| `/admin/affiliates` | PASS | PASS | 0 | 61 | 1855 |  |
| `/admin/affiliates/[id]` | PASS | PASS | 0 | 68 | 1940 | variants: affiliate with a correction, affiliate without one |
| `/admin/affiliates/applications` | PASS | PASS | 0 | 50 | 1926 |  |
| `/admin/affiliates/new` | PASS | PASS | 0 | 31 | 1867 |  |
| `/admin/analytics` | PASS | PASS | 0 | 153 | 1868 |  |
| `/admin/change-password` | PASS | PASS | 0 | 36 |  | variants: member who must change the temporary password |
| `/admin/customers` | PASS | PASS | 0 | 60 | 1862 |  |
| `/admin/customers/[id]` | PASS | PASS | 0 | 41 | 1916 | variants: top customer |
| `/admin/forgot` | PASS | PASS | 0 | 102 |  | variants: signed out |
| `/admin/inventory` | PASS | PASS | 0 | 80 | 1860 |  |
| `/admin/login` | PASS | PASS | 0 | 30 |  | variants: signed out |
| `/admin/marketing` | PASS | PASS | 0 | 83 | 1878 |  |
| `/admin/marketing/content` | PASS | PASS | 0 | 30 | 1864 |  |
| `/admin/marketing/discounts` | PASS | PASS | 0 | 45 | 1871 |  |
| `/admin/mfa` | PASS | PASS | 0 | 37 |  | variants: member who must enrol two-factor |
| `/admin/orders` | PASS | PASS | 0 | 52 | 1901 |  |
| `/admin/orders/[id]` | PASS | PASS | 0 | 41 | 1903 | variants: paid affiliate order, plain delivered order |
| `/admin/orders/new` | PASS | PASS | 0 | 43 | 1888 |  |
| `/admin/print` | PASS | PASS | 0 | 38 |  | variants: packing slip, invoice |
| `/admin/products` | PASS | PASS | 0 | 35 | 1854 |  |
| `/admin/products/[id]` | PASS | PASS | 0 | 48 | 1855 | variants: RED BURN |
| `/admin/products/new` | PASS | PASS | 0 | 32 | 1872 |  |
| `/admin/set-password` | PASS | PASS | 0 | 23 |  | variants: bad link |
| `/admin/settings` | PASS | PASS | 0 | 34 | 1852 |  |
| `/admin/settings/activity` | PASS | PASS | 0 | 29 | 1876 |  |
| `/admin/settings/shipping` | PASS | PASS | 0 | 63 | 1873 |  |
| `/admin/settings/team` | PASS | PASS | 0 | 39 | 1885 |  |

#### Public pages
| Page | Desktop 1440px | Phone 375px | Console errors + failed requests | Load ms (desktop) | Phone interactive est. ms | Notes |
|---|---|---|---|---|---|---|
| `/` | PASS | PASS | 0 | 69 |  |  |
| `/ambassadors` | PASS | PASS | 0 | 36 |  |  |
| `/maintenance` | PASS | PASS | 0 | 42 |  | variants: storefront live: the page is hidden (404 by design) |
| `/partner/[token]` | PASS | PASS | 0 | 39 |  | variants: affiliate with a correction |
| `/policies/[slug]` | PASS | PASS | 0 | 32 |  | variants: shipping policy |
| `/products` | PASS | PASS | 0 | 39 |  |  |
| `/products/[slug]` | PASS | PASS | 0 | 60 |  | variants: RED BURN |
<!-- END:pages -->

### API routes and server actions

<!-- BEGIN:routes -->
#### API and file routes
| Route | Test files that exercise it |
|---|---|
| `/admin/affiliates/export` | e2e/affiliates.spec.ts, qa/admin-data.spec.ts, qa/admin-interactions.spec.ts, qa/admin-security.spec.ts |
| `/admin/analytics/export` | qa/admin-interactions.spec.ts, qa/admin-security.spec.ts |
| `/admin/api/events` | e2e/add-member.spec.ts, e2e/flows.spec.ts, e2e/maintenance.spec.ts, e2e/qa-live.spec.ts, integration/maintenance.test.ts, integration/members.test.ts, integration/proxy.test.ts, qa/admin-live.spec.ts |
| `/admin/api/notifications` | e2e/add-member.spec.ts, e2e/flows.spec.ts, e2e/maintenance.spec.ts, integration/maintenance.test.ts, integration/members.test.ts, integration/no-mail.test.ts, integration/proxy.test.ts, integration/qa-security-matrix.test.ts, qa/admin-security.spec.ts |
| `/admin/api/search` | integration/maintenance.test.ts, integration/proxy.test.ts, integration/qa-security-matrix.test.ts, qa/admin-security.spec.ts |
| `/admin/backup/download` | e2e/flows.spec.ts, integration/backup.test.ts, integration/proxy.test.ts, integration/qa-security-matrix.test.ts, qa/admin-security.spec.ts |
| `/admin/customers/export` | qa/admin-interactions.spec.ts, qa/admin-security.spec.ts |
| `/admin/orders/export` | e2e/add-member.spec.ts, e2e/flows.spec.ts, integration/proxy.test.ts, qa/admin-interactions.spec.ts, qa/admin-security.spec.ts |
| `/api/health` | e2e/build-security.spec.ts, e2e/flows.spec.ts, e2e/maintenance.spec.ts, e2e/qa-live.spec.ts, integration/health.test.ts, integration/maintenance.test.ts, integration/no-mail.test.ts, unit/railway-guards.test.ts |
| `/api/track` | e2e/build-security.spec.ts, e2e/maintenance.spec.ts, integration/maintenance.test.ts, integration/preview.test.ts |
| `/uploads/[file]` | e2e/build-security.spec.ts, e2e/flows.spec.ts, e2e/maintenance.spec.ts, integration/maintenance.test.ts, integration/storage.test.ts |

#### Server actions
| Action | Test files that call or classify it |
|---|---|
| `applyAction` | integration/affiliates-admin.test.ts |
| `quoteAction` | integration/maintenance.test.ts, integration/preview.test.ts |
| `placeOrder` | e2e/flows.spec.ts, integration/affiliate-rules.test.ts, integration/affiliates-admin.test.ts, integration/affiliates.test.ts, integration/backup.test.ts, integration/maintenance.test.ts, integration/no-mail.test.ts, integration/orders-concurrency.test.ts, integration/orders.test.ts, integration/preview.test.ts, integration/qa-ledger-locks.test.ts, integration/qa-migrations.test.ts, integration/qa-security-matrix.test.ts |
| `captureCheckout` | integration/maintenance.test.ts, integration/preview.test.ts |
| `changePassword` | integration/auth-gates.test.ts, integration/auth.test.ts |
| `revokeSession` | integration/auth-gates.test.ts, integration/auth.test.ts |
| `saveAffiliate` | integration/affiliates-admin.test.ts, integration/auth-gates.test.ts |
| `suggestCode` | integration/affiliates-admin.test.ts, integration/auth-gates.test.ts |
| `upgradeTierAction` | integration/affiliates-admin.test.ts, integration/auth-gates.test.ts |
| `recordPayoutAction` | integration/affiliates-admin.test.ts, integration/auth-gates.test.ts |
| `approveApplicationAction` | integration/affiliates-admin.test.ts, integration/auth-gates.test.ts |
| `rejectApplicationAction` | integration/affiliates-admin.test.ts, integration/auth-gates.test.ts |
| `saveCustomer` | integration/auth-gates.test.ts, integration/qa-ledger-locks.test.ts |
| `toggleBlock` | integration/auth-gates.test.ts |
| `adjustStock` | integration/auth-gates.test.ts |
| `setThreshold` | integration/auth-gates.test.ts |
| `addBatch` | integration/auth-gates.test.ts |
| `receiveBatch` | integration/auth-gates.test.ts |
| `saveDiscount` | integration/auth-gates.test.ts, integration/qa-ledger-locks.test.ts |
| `toggleDiscount` | integration/auth-gates.test.ts |
| `markContacted` | integration/auth-gates.test.ts |
| `saveTracking` | integration/auth-gates.test.ts |
| `saveAnnouncement` | integration/auth-gates.test.ts |
| `saveHero` | integration/auth-gates.test.ts |
| `saveFaq` | integration/auth-gates.test.ts |
| `addTestimonial` | integration/auth-gates.test.ts |
| `setTestimonial` | integration/auth-gates.test.ts |
| `changeStatus` | integration/auth-gates.test.ts, integration/members.test.ts, integration/qa-ledger-locks.test.ts |
| `bulkStatus` | integration/auth-gates.test.ts |
| `toggleCod` | integration/auth-gates.test.ts |
| `saveDelivery` | integration/auth-gates.test.ts, integration/qa-ledger-locks.test.ts |
| `addComment` | integration/auth-gates.test.ts |
| `cancelOrder` | integration/auth-gates.test.ts |
| `returnOrder` | integration/auth-gates.test.ts |
| `createManualOrder` | integration/auth-gates.test.ts, integration/maintenance.test.ts |
| `saveProduct` | integration/auth-gates.test.ts, integration/storage.test.ts |
| `archiveProduct` | integration/auth-gates.test.ts |
| `uploadImage` | integration/auth-gates.test.ts, integration/storage.test.ts |
| `updateImage` | integration/auth-gates.test.ts |
| `moveImage` | integration/auth-gates.test.ts |
| `deleteImage` | integration/auth-gates.test.ts, integration/storage.test.ts |
| `seedStoreAction` | integration/auth-gates.test.ts, integration/qa-action-fuzz.test.ts |
| `backupNow` | integration/auth-gates.test.ts, integration/qa-action-fuzz.test.ts |
| `saveStore` | integration/auth-gates.test.ts, integration/orders.test.ts |
| `saveNotifications` | integration/auth-gates.test.ts |
| `savePolicies` | integration/auth-gates.test.ts |
| `saveSecurity` | integration/auth-gates.test.ts, integration/orders.test.ts |
| `saveZone` | integration/auth-gates.test.ts, integration/qa-ledger-locks.test.ts |
| `savePartner` | integration/auth-gates.test.ts |
| `settlePartner` | integration/auth-gates.test.ts |
| `inviteMember` | integration/auth-gates.test.ts, integration/auth.test.ts, integration/members.test.ts |
| `cancelInvite` | integration/auth-gates.test.ts |
| `setRole` | integration/auth-gates.test.ts |
| `setActive` | integration/auth-gates.test.ts |
| `sendReset` | integration/auth-gates.test.ts, integration/no-mail.test.ts |
| `resetMfa` | integration/auth-gates.test.ts, integration/auth.test.ts |
| `addMember` | integration/auth-gates.test.ts, integration/members.test.ts, unit/static-guards.test.ts |
| `regenerateTemporaryPasswordAction` | integration/auth-gates.test.ts, integration/members.test.ts |
| `forceChangePassword` | integration/members.test.ts |
| `startEnroll` | integration/auth.test.ts, integration/members.test.ts |
| `finishEnroll` | integration/auth.test.ts, integration/members.test.ts |
| `verifyLogin` | integration/auth.test.ts |
| `regenerateRecoveryCodes` | integration/auth.test.ts |
| `disableMfa` | integration/auth.test.ts |
| `setPassword` | integration/auth.test.ts, unit/static-guards.test.ts |
| `login` | e2e/add-member.spec.ts, e2e/admin-security.spec.ts, e2e/affiliates.spec.ts, e2e/build-security.spec.ts, e2e/flows.spec.ts, e2e/maintenance.spec.ts, e2e/pages.spec.ts, e2e/qa-live.spec.ts, integration/auth-gates.test.ts, integration/auth.test.ts, integration/maintenance.test.ts, integration/members.test.ts, integration/no-mail.test.ts, integration/proxy.test.ts, qa/admin-security.spec.ts, unit/core.test.ts, unit/live-sync.test.ts, unit/static-guards.test.ts |
| `logout` | integration/auth-gates.test.ts, integration/auth.test.ts, integration/qa-action-fuzz.test.ts |
| `logoutEverywhere` | integration/auth-gates.test.ts, integration/auth.test.ts, integration/qa-action-fuzz.test.ts |
| `requestReset` | integration/auth-gates.test.ts, integration/auth.test.ts, integration/no-mail.test.ts, unit/static-guards.test.ts |
<!-- END:routes -->

### Interactions (filters, search, sort, pagination, exports, overlays, validation, empty and error states, bulk action)

<!-- BEGIN:interactions -->
58 recorded interactions (desktop and phone), 58 passed, 0 failed.

| Page | Interaction | Desktop | Phone |
|---|---|---|---|
| `/admin/orders` | pagination: next, previous, and a page past the end | PASS | PASS |
| `/admin/customers` | pagination: next, previous, and a page past the end | PASS | PASS |
| `/admin/products` | pagination: next, previous, and a page past the end | PASS | PASS |
| `/admin/inventory` | pagination: next, previous, and a page past the end | PASS | PASS |
| `/admin/marketing/discounts` | pagination: next, previous, and a page past the end | PASS | PASS |
| `/admin/orders` | search by order number, name and phone; every status filter; every payment filter | PASS | PASS |
| `/admin/orders` | COD pending filter and date range | PASS | PASS |
| `/admin/customers` | search, tag, blocked and sort | PASS | PASS |
| `/admin/products` | search and every status filter | PASS | PASS |
| `/admin/inventory` | search, low-stock and out-of-stock filters | PASS | PASS |
| `/admin/affiliates` | search, every status filter, empty result | PASS | PASS |
| `/admin/settings/activity` | paging and filters load | PASS | PASS |
| `exports` | orders, customers, analytics (every kind) and affiliates CSV are real CSV files | PASS | PASS |
| `/admin/orders` | Export CSV and New order buttons are present and link to real pages | PASS | PASS |
| `shell` | notification bell opens, lists alerts and the new applications, closes with Escape, mute toggles | PASS | PASS |
| `shell` | command palette: Ctrl+K, search a customer and an affiliate, Escape closes | PASS | n/a |
| `/admin/orders/new` | no products: a clear message and no order created | PASS | PASS |
| `/admin/affiliates/new` | empty, bad and duplicate input each get a clear message; nothing is saved | PASS | PASS |
| `/admin/marketing/discounts` | a bad code and a bad percent are refused with a message | PASS | PASS |
| `/admin/settings` | an invalid WhatsApp number is refused | PASS | PASS |
| `/admin/account` | a mismatching password change is refused | PASS | PASS |
| `/admin/products/new` | a product without a name is not created | PASS | PASS |
| `/admin/inventory` | an invalid stock adjustment is refused and the ledger stays balanced | PASS | PASS |
| `errors` | unknown ids give the branded 404 page, never a stack trace | PASS | PASS |
| `errors` | a bad month and bad export parameters are refused politely | PASS | PASS |
| `/admin/affiliates/[id]` | a tier banner appears for an affiliate with 10+ delivered orders, with a one-tap upgrade button | PASS | PASS |
| `/admin/affiliates/[id]` | the balance correction banner and the payout button show the net amount | PASS | PASS |
| `/admin/affiliates/applications` | every application shows its handles, details and decision buttons | PASS | PASS |
| `/admin/orders` | bulk action: select two new orders, mark them confirmed, the timeline and the database follow | PASS | PASS |
| `shell` | phone navigation: the menu opens and every entry (including Affiliates) is reachable at 48px | n/a | PASS |
<!-- END:interactions -->

### Data on screen vs SQL

<!-- BEGIN:data -->
457 on-screen numbers compared with independent SQL: 457 equal, 0 different.

| Page | Check | Screen | SQL | Result |
|---|---|---|---|---|
| `/admin/orders` | orders count (1x) | 3000 | 3000 | PASS |
| `/admin/orders` | newest order number is first (1x) | 3851 | 3851 | PASS |
| `/admin/orders` | newest order total (1x) | 19645 | 19645 | PASS |
| `/admin/customers` | customer count (1x) | 2000 | 2000 | PASS |
| `/admin/customers` | page count (50 per page) (1x) | 40 | 40 | PASS |
| `/admin/products` | product count (1x) | 40 | 40 | PASS |
| `/admin/inventory` | inventory item count (1x) | 37 | 37 | PASS |
| `/admin/marketing/discounts` | discount count (1x) | 20 | 20 | PASS |
| `/admin` | today's sales (1x) | 53636 | 53636 | PASS |
| `/admin` | today's orders (1x) | 4 | 4 | PASS |
| `/admin` | 30-day revenue (1x) | 2664666 | 2664666 | PASS |
| `/admin` | 30-day orders (1x) | 198 | 198 | PASS |
| `/admin` | new applications banner (1x) | 12 | 12 | PASS |
| `/admin/affiliates` | orders (20x) | 20 | 20 | PASS |
| `/admin/affiliates` | sales (20x) | 353088 | 353088 | PASS |
| `/admin/affiliates` | pending (20x) | 28996 | 28996 | PASS |
| `/admin/affiliates` | approved (20x) | 41622 | 41622 | PASS |
| `/admin/affiliates` | paid (20x) | 0 | 0 | PASS |
| `/admin/affiliates` | overview: affiliate sales (1x) | 5082925 | 5082925 | PASS |
| `/admin/affiliates` | overview: commission owed (1x) | 612439 | 612439 | PASS |
| `/admin/affiliates` | overview: ready to pay (1x) | 122571 | 122571 | PASS |
| `/admin/affiliates` | overview: corrections owed back (1x) | 14287 | 14287 | PASS |
| `/admin/affiliates` | overview: active affiliates (1x) | 14 | 14 | PASS |
| `/admin/affiliates` | sum of the rows = SQL total sales (1x) | 5082925 | 5082925 | PASS |
| `/admin/affiliates` | sum of the rows = SQL total paid (1x) | 370488 | 370488 | PASS |
| `/admin/affiliates` | top five (code, sales, orders) (1x) | [["QAAFF12",353088,20],["QAAFF16",305946 | [["QAAFF12",353088,20],["QAAFF16",305946 | PASS |
| `/admin/affiliates//<each>` | orders (20x) | 22 | 22 | PASS |
| `/admin/affiliates//<each>` | sales (20x) | 303931 | 303931 | PASS |
| `/admin/affiliates//<each>` | pending (20x) | 20319 | 20319 | PASS |
| `/admin/affiliates//<each>` | owed now (approved) (20x) | 6506 | 6506 | PASS |
| `/admin/affiliates//<each>` | paid (20x) | 18765 | 18765 | PASS |
| `/admin/affiliates//<each>` | orders listed (20x) | 25 | 25 | PASS |
| `/admin/affiliates//<each>` | payout rows are net = gross - corrections (20x) | true | true | PASS |
| `/admin/affiliates//<each>` | payout history rows (20x) | 1 | 1 | PASS |
| `/admin/affiliates//<each>` | payout history: total paid (20x) | 18765 | 18765 | PASS |
| `/admin/affiliates//<each>` | payout history: corrections (20x) | 0 | 0 | PASS |
| `/admin/affiliates//<each>` | books balance (paid out = commissions paid - corrections deducted) (20x) | 18765 | 18765 | PASS |
| `/<each>` | orders (20x) | 22 | 22 | PASS |
| `/<each>` | sales (20x) | 303931 | 303931 | PASS |
| `/<each>` | pending (20x) | 20319 | 20319 | PASS |
| `/<each>` | approved (20x) | 6506 | 6506 | PASS |
| `/<each>` | paid (20x) | 18765 | 18765 | PASS |
| `/admin/affiliates/export 2026-11` | rows (1x) | 28 | 28 | PASS |
| `/admin/affiliates/export 2026-11` | commission total (1x) | 62540 | 62540 | PASS |
| `/admin/affiliates/export 2026-11` | sale total (1x) | 325906 | 325906 | PASS |
| `/admin/affiliates/export 2026-11` | order numbers (1x) | [1385,1673,1697,1931,1955,2105,2141,2333 | [1385,1673,1697,1931,1955,2105,2141,2333 | PASS |
| `/admin/affiliates/export 2026-10` | rows (1x) | 40 | 40 | PASS |
| `/admin/affiliates/export 2026-10` | commission total (1x) | 83196 | 83196 | PASS |
| `/admin/affiliates/export 2026-10` | sale total (1x) | 441696 | 441696 | PASS |
| `/admin/affiliates/export 2026-10` | order numbers (1x) | [1073,1253,1277,1367,1391,1499,1541,1547 | [1073,1253,1277,1367,1391,1499,1541,1547 | PASS |
| `/admin/affiliates/export 2026-09` | rows (1x) | 44 | 44 | PASS |
| `/admin/affiliates/export 2026-09` | commission total (1x) | 106772 | 106772 | PASS |
| `/admin/affiliates/export 2026-09` | sale total (1x) | 568834 | 568834 | PASS |
| `/admin/affiliates/export 2026-09` | order numbers (1x) | [1001,1055,1061,1109,1157,1229,1271,1463 | [1001,1055,1061,1109,1157,1229,1271,1463 | PASS |
| `/admin/affiliates/export 2026-08` | rows (1x) | 41 | 41 | PASS |
| `/admin/affiliates/export 2026-08` | commission total (1x) | 96276 | 96276 | PASS |
| `/admin/affiliates/export 2026-08` | sale total (1x) | 476003 | 476003 | PASS |
| `/admin/affiliates/export 2026-08` | order numbers (1x) | [1085,1091,1199,1259,1319,1337,1409,1457 | [1085,1091,1199,1259,1319,1337,1409,1457 | PASS |
<!-- END:data -->

## 3. Performance (step 6)

<!-- BEGIN:perf -->
Mobile profile: 375px, 4x CPU slowdown, 1.6 Mbit/s, 150 ms round trip, cache off. Interactive estimate = max(load, first contentful paint) + total blocking time. Target: under 2000 ms.

| Page | Load ms | First paint ms | Largest paint ms | Blocking ms | Interactive est. ms | KB | Result |
|---|---|---|---|---|---|---|---|
| `/admin` | 1882 | 896 | 896 | 0 | 1882 | 325 | PASS |
| `/admin/account` | 1865 | 808 | 808 | 0 | 1865 | 316 | PASS |
| `/admin/affiliates` | 1855 | 824 | 824 | 0 | 1855 | 325 | PASS |
| `/admin/affiliates/5a0a99d3-f812-42e9-8579-1f37996dd8ed` | 1940 | 876 | 876 | 0 | 1940 | 330 | PASS |
| `/admin/affiliates/d40c9d77-59f3-44c8-a7c3-ef22f805c71c` | 1890 | 832 | 832 | 0 | 1890 | 330 | PASS |
| `/admin/affiliates/applications` | 1926 | 892 | 892 | 0 | 1926 | 321 | PASS |
| `/admin/affiliates/new` | 1867 | 808 | 808 | 0 | 1867 | 318 | PASS |
| `/admin/analytics` | 1868 | 836 | 836 | 0 | 1868 | 323 | PASS |
| `/admin/customers` | 1862 | 828 | 828 | 0 | 1862 | 325 | PASS |
| `/admin/customers/40e8976b-98e7-4c93-ba62-d58bf9165bf4` | 1916 | 864 | 864 | 0 | 1916 | 317 | PASS |
| `/admin/inventory` | 1860 | 824 | 824 | 0 | 1860 | 331 | PASS |
| `/admin/marketing` | 1878 | 816 | 816 | 0 | 1878 | 319 | PASS |
| `/admin/marketing/content` | 1864 | 820 | 820 | 0 | 1864 | 320 | PASS |
| `/admin/marketing/discounts` | 1871 | 816 | 816 | 0 | 1871 | 329 | PASS |
| `/admin/orders` | 1901 | 856 | 856 | 0 | 1901 | 322 | PASS |
| `/admin/orders/0af1887b-e209-4532-bb1f-beb2a1df756f` | 1903 | 856 | 856 | 0 | 1903 | 322 | PASS |
| `/admin/orders/656a3bea-58f3-4003-8436-d433a3d34c81` | 1867 | 808 | 808 | 0 | 1867 | 320 | PASS |
| `/admin/orders/new` | 1888 | 828 | 828 | 0 | 1888 | 317 | PASS |
| `/admin/products` | 1854 | 828 | 828 | 0 | 1854 | 322 | PASS |
| `/admin/products/1ac5b8e2-6171-4fee-a448-fc1af79eb2b8` | 1855 | 816 | 816 | 0 | 1855 | 325 | PASS |
| `/admin/products/new` | 1872 | 832 | 832 | 0 | 1872 | 317 | PASS |
| `/admin/settings` | 1852 | 804 | 804 | 0 | 1852 | 319 | PASS |
| `/admin/settings/activity` | 1876 | 832 | 832 | 0 | 1876 | 320 | PASS |
| `/admin/settings/shipping` | 1873 | 824 | 824 | 0 | 1873 | 320 | PASS |
| `/admin/settings/team` | 1885 | 824 | 824 | 0 | 1885 | 319 | PASS |
<!-- END:perf -->

<!-- BEGIN:findings -->
## 4. Findings

Severity: **High** = wrong money or data, or a feature unusable; **Medium** = wrong or confusing for the team under normal use; **Low** = polish or hardening.

| # | Finding | Severity | Status | Test that proves it |
|---|---|---|---|---|
| 1 | Dashboard "today", week, month and hour buckets followed the SERVER's time zone (UTC on Railway), so sales made between midnight and 03:00 in Lebanon counted for the previous day | High | Fixed (all buckets in Asia/Beirut, DST safe) | `tests/unit/stats-timezone.test.ts` (also run under TZ=UTC, Pacific/Kiritimati and America/Los_Angeles: identical results), QA data spec "dashboard: today's sales" |
| 2 | Affiliate monthly CSV cut months at UTC midnight instead of Beirut midnight (orders near month end landed in the wrong month) | High | Fixed (`lib/time.ts monthRange`, Beirut and UTC columns in the file) | `affiliate-rules.test.ts` (23:30 / 00:30 at winter and summer time), `time-csv.test.ts`, QA data spec (monthly CSV vs SQL) |
| 3 | Spreadsheet formula injection: a customer or affiliate named `=HYPERLINK(...)`, `+cmd`, `@SUM` would execute when the team opened any CSV export | High | Fixed (`csvCell` defuses leading = + - @ tab CR; real numbers and phone-style values untouched; all four exports) | `tests/unit/time-csv.test.ts`, `affiliate-rules.test.ts` (exported file), QA interactions (every export scanned) |
| 4 | A commission that was already PAID and whose order was later returned or cancelled left no trace: the affiliate kept the money and no balance showed it | High | Fixed (stays linked to its payout as a visible correction on the affiliate page, list, overview and partner page, deducted from the next payout, carried forward if bigger; `checkAffiliateBooks()` proves paid out = paid - corrections) | `affiliate-rules.test.ts` (correction, carry-forward, books), `qa-migrations.test.ts`, QA data spec (books balance for all 20 affiliates), migration `0006` |
| 5 | On a phone every card in a list was one big link, so ticking an order's checkbox (bulk select) opened the order instead; a control nested in a link is also invalid HTML | High | Fixed (cards with controls link through the title only) | QA interactions "bulk action" at desktop and phone |
| 6 | The partner stats link could be guessed at without limit | Medium | Fixed (20 wrong links a minute lock a connection out, 120 views a minute cap; 192-bit tokens) | `affiliate-rules.test.ts` (200 unique tokens, lock-out) |
| 7 | The private partner link of every affiliate was included in the admin affiliates LIST payload sent to the browser | Medium | Fixed (stripped, as are notes, email and phone) | `qa-security-matrix.test.ts` (no token in any list or form page, every role) |
| 8 | New ambassador applications did not show on the dashboard or the bell (no live alert) | Medium | Fixed (banner, bell list, toast and sound, SSE plus polling) | `tests/qa/admin-live.spec.ts` (SSE, toast, polling with the stream blocked) |
| 9 | Affiliate sales were shown rounded down in the list and rounded up in the top-five (for example $3,530 vs $3531) | Medium | Fixed (cents everywhere) | QA data spec (list, overview, top five vs SQL to the cent) |
| 10 | Recording a payout used the status the page last showed, so a commission that had just become due could be missed | Medium | Fixed (approval check runs inside the payout transaction) | `affiliates-admin.test.ts`, `affiliate-rules.test.ts` |
| 11 | Server-rendered and client dates were formatted in the server's or the browser's zone | Medium | Fixed (explicit Asia/Beirut on every admin date, the partner page and the bell). No dedicated test of every date string | covered indirectly by findings 1 and 2; **not separately tested** |
| 12 | Application form wiped everything typed after a rejection; payout and approval confirmations vanished when the page refreshed | Medium | Fixed (found earlier on the affiliate branch) | `tests/e2e/affiliates.spec.ts` |
| 13 | Phone tap targets under 48px: Sign out (2FA and password steps), Back to sign in, Forgot password, the affiliate link on an order, order numbers in cards | Medium | Fixed | QA crawl (every page at 375px) |
| 14 | Text under 13px on a phone on 23 admin pages (bell badge, table labels, breadcrumbs, print slips, thumbnails placeholder) | Low | Fixed | QA crawl (every page at 375px) |
| 15 | Mobile load on the products list was the slowest admin page (2.1 s on the emulated profile) | Low | Fixed (15 per page, thumbnails not downloaded on phones); now 1855 ms | `tests/qa/admin-perf.spec.ts` |
| 16 | Affiliate tables and pager text are upper-cased by CSS, which broke three of my own QA checks | n/a | Test defects, fixed in the tests (not product bugs) | n/a |
| 17 | Baseline mobile cost: every admin page needs about 320 KB of shared script and styles, so under the emulated slow phone (1.6 Mbit/s, 4x CPU) every page sits close to the 2 s target: 1.85 to 1.94 s on a quiet machine, 2.0 to 2.4 s on the same machine when it was busier (re-measured with the previously green code, which gave the same slower numbers, so it is the machine and not a regression) | Low | **Remaining**: the target is met only with a narrow margin and the `admin-perf.spec.ts` budget check is sensitive to how busy the test machine is. Real phones and networks vary | `tests/qa/admin-perf.spec.ts` (passed 25 of 25 on a quiet machine) |
| 18 | Settings and page-content forms (store details, notifications, policies, security, tracking ids, announcement bar, hero text, FAQ) had no stale-save check: the last save won silently | Low | Fixed (each form carries the record's version; a save from an out-of-date form is refused with "This was changed elsewhere since you opened it. Reload the page..." and writes nothing; check and write in one transaction; testimonials merge by id from a fresh read, so two tabs cannot overwrite each other) | `tests/integration/stale-save.test.ts` (all 8 forms in a two-tab scenario, garbage versions, 3 simultaneous saves: one wins, rendered forms carry the current version) |
| 19 | `npm run purge-demo` crashed immediately ("unknown column batches.is_demo": lots have no demo flag) and, when it did run, changed stock without a stock movement | Medium | Fixed (demo lots are matched by the generator's `DEMO-` lot number; stock is reversed by `lib/demo-stock.ts`, which logs a `demo_purge` movement per item and keeps on_hand equal to the ledger, also when stock is clamped at zero) | `tests/integration/demo-purge.test.ts` (the function, and the real script run on a copy of the large database: demo rows gone, ledger balanced, CSV backup written) |
| 20 | The live-alert bus lives in one process: with more than one replica the bell would only see its own instance's events (polling still catches up within 30 s) | Low | **Remaining** by design (Railway runs one replica) | n/a |
| 21 | One Playwright worker crash on Windows (exit code 3221226505) once in a verify run; not reproducible, not application code | Low | **Remaining** (infrastructure flake) | n/a |

Behaviour confirmed, no defect: `/maintenance` answers 404 while the storefront is live (it is only shown by SITE_MODE=maintenance); in maintenance mode `/ambassadors`, `/partner/...` and the checkout (including its discount field) are closed to the public with the rest of the storefront, the admin stays open, and a signed-in admin's preview TEST order that uses an affiliate code gets the real discount but earns no commission and counts as no sale (`affiliate-rules.test.ts`).

## 5. Rules checked (steps 3 to 5)

| Rule | Proof |
|---|---|
| Discount = customer discount % of the products subtotal only; commission = rate % of the discounted products subtotal; integer cents; 100 random carts against an independent BigInt calculation | `tests/integration/affiliate-rules.test.ts`, `tests/unit/affiliate-math.test.ts` |
| Codes: case-insensitive, unique (shared with discount codes), only active affiliates, paused and ended rejected with a message, one code per order, retry and double submit create one order | `affiliate-rules.test.ts`, `affiliates.test.ts`, `tests/e2e/affiliates.spec.ts` |
| Lifecycle: pending until delivered; approved at exactly 14 days (not 1 ms earlier), across three simulated server restarts; void on cancel and return; paid only through a payout | `affiliate-rules.test.ts` (the clock is controlled by passing `now` and by moving the stored delivery time; the system clock itself was not changed) |
| Payouts cannot pay a commission twice (6 parallel calls, two real browser tabs clicking together); totals reconcile between detail, list, overview and CSV | `affiliate-rules.test.ts`, `admin-live.spec.ts`, QA data spec |
| Tier banner at exactly 10 and 30 delivered orders, upgrade changes future orders only | `affiliate-rules.test.ts` |
| Applications: approve once even on a double click, reject, spam protection (honeypot, minimum fill time, rate limit, duplicates) and server-side validation | `affiliates-admin.test.ts`, `admin-live.spec.ts`, `tests/e2e/affiliates.spec.ts` |
| Partner page: only that affiliate's data (20 affiliates cross-checked), noindex, mobile, rate limited | `affiliate-rules.test.ts`, QA data spec |
| Migrations on a COPY of a pre-affiliate database: no data lost, no existing value changed, idempotent, restarts change nothing, original file untouched, affiliates work afterwards | `tests/integration/qa-migrations.test.ts` |
| Backup then restore into a fresh folder: every table count and every affiliate balance equal, books balance | `tests/integration/qa-persistence.test.ts` |
| Parallel scenarios: last unit of stock (one wins), two tabs editing (conflict message), stock ledger equals displayed stock, cancel and return restore once | `qa-ledger-locks.test.ts`, `orders-concurrency.test.ts` |
| Roles, direct calls, logged-out redirect, no secret or stack trace in responses, CSRF, rate limits, session timeout, 2FA | `tests/qa/admin-security.spec.ts`, `qa-security-matrix.test.ts`, `auth-gates.test.ts`, `tests/e2e/admin-security.spec.ts`, `tests/e2e/qa-live.spec.ts` (log scan, CSRF) |

## 6. Commands that were run

```bash
npm run verify                              # typecheck, lint (0 warnings), 160 unit, 348 integration, build, 142 end-to-end: all pass
npm run build && npm run qa:admin           # the admin QA on a production build and the large temporary database: 22 of 22 pass
npx tsx tests/qa/make-report.ts             # fills the generated tables of this report from the raw results
npx tsx tests/support/qa-inventory.ts       # the route inventory of step 1
TZ=UTC npx vitest run tests/unit/stats-timezone.test.ts tests/unit/time-csv.test.ts tests/integration/affiliate-rules.test.ts   # also TZ=Pacific/Kiritimati and TZ=America/Los_Angeles: 32 of 32 each
```

## 7. Not verified (cannot be proven offline)

- **Real email**: invites, resets and order alerts were written to a local file; Brevo or SMTP delivery, spam folders and links in real mail clients were not tested.
- **Real domain and HTTPS**: Secure cookies, HSTS, the production host name and CSP behaviour over TLS, and links built from the real `NEXT_PUBLIC_SITE_URL`.
- **Railway**: the real volume (permissions, mount timing, persistence across deploys, size), the nightly backup schedule and the optional S3 copy, the proxy's idle timeouts on the live-alert stream, a restart during a deploy, and the single-replica setting.
- **Real phones**: touch behaviour, iOS Safari rendering, safe areas, backdrop blur cost and battery, real mobile networks. The phone runs used Edge emulating a 375px touch device, and the speed numbers are browser metrics under throttling (an estimate of interactive time, not a Lighthouse score).
- **Lighthouse** was not run.
- **The real clock**: the 14-day approval was proven with a controlled `now` and moved timestamps, not by waiting or changing the system clock; the daylight-saving change itself (last Sunday of March and October in Lebanon) was tested with fixed instants, not live.
- **Customer-facing storefront QA** beyond what the admin flows touch (checkout on real devices, WhatsApp hand-off, tracking pixels).
- **A real payment or delivery partner**: none exists yet (cash on delivery only).
<!-- END:findings -->
