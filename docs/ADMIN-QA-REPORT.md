# MIEL+ admin QA report

Branch `admin-qa`. A page that was not tested is marked **NOT TESTED**, never PASS. Sections between `BEGIN` / `END` markers are generated from the raw results of the last QA run by `npx tsx tests/qa/make-report.ts`; everything else is written by hand.

<!-- BEGIN:summary -->
<!-- END:summary -->

## 1. Inventory (step 1)

Walked from the route tree by `tests/support/qa-inventory.ts` (`npx tsx tests/support/qa-inventory.ts`). A ticked box means at least one test visited the page (or, for routes and actions, mentions it). Unticked = **NOT TESTED**.

<!-- BEGIN:inventory -->
<!-- END:inventory -->

## 2. Every page, desktop and phone (step 2)

<!-- BEGIN:pages -->
<!-- END:pages -->

### API routes and server actions

<!-- BEGIN:routes -->
<!-- END:routes -->

### Interactions (filters, search, sort, pagination, exports, overlays, validation, empty and error states, bulk action)

<!-- BEGIN:interactions -->
<!-- END:interactions -->

### Data on screen vs SQL

<!-- BEGIN:data -->
<!-- END:data -->

## 3. Performance (step 6)

<!-- BEGIN:perf -->
<!-- END:perf -->

<!-- BEGIN:findings -->
<!-- END:findings -->
