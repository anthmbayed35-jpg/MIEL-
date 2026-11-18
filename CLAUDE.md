# MIEL+ website

Lebanon-only honey sports-nutrition sachets. Next.js (App Router) + Tailwind 4, deployable to Vercel.
Tone: raw, performance-driven, short punchy copy. English only. No medical claims.

## Hard rules
- **New products are added only through `config/products.ts`.** The home lineup, `/products/[slug]` pages, compare strip, sitemap, metadata, JSON-LD and cart all read from it. Never hardcode a product elsewhere.
- **Never invent values.** Unknown nutrition, ingredients, allergens, shelf life and warnings are `null` in config and render as a clean `TBC`.
- Pouch price is one value: `POUCH_PRICE` in `config/site.ts`. Per-sachet price = `perSachet(price)` in `lib/format.ts` (price / 12, rounded to 2 decimals).
- **Product photos:** originals go untouched in `assets-src/<slug>/<name>.webp` (never served). `npm run images` generates AVIF + WebP at 480/768/1080/1600 (never upscaled), blur placeholders (`config/photos.generated.ts`, generated, do not edit) and the 1200x630 OG images. Then list them in the product's `images` array in `config/products.ts` (order: pouch-hero, flat-lay, sachet-open, ingredients; each with `kind`, `src` base path, specific `alt`, short `label`). Products with 0 to 3 photos fall back to labelled placeholders automatically.
- Photos are 4:5. Render them with `<Photo>` / `<ProductImage>` (`<picture>` AVIF+WebP, explicit width/height, lazy). Use `fit="cover"` only inside a 4:5 container; any other ratio must use `fit="contain"` or a focal-point crop that keeps all packaging text visible. Never put glass UI over a label: overlay buttons/counters live in the top corners only.
- The only explicit preload is the home hero photo (`components/Hero.tsx`). Do not add `priority`/preload to other images.
- Do not redraw or recolor the logos in `public/brand/` (`miel-m-plus.png`, `miel-full.png`).

## Design system (defined in `app/globals.css`)
- Colors: base `#23201C`, off-white `#F2EFE8`, acid `#DAFC69` (CTAs, key words, numbers only), borders `#3A3631`, muted `#8A857D`, body text `#CFCCC4`. Dark only.
- Type: Archivo (width axis) + Space Mono only, via `next/font`.
  - `.display`: Archivo 125 width, 800, UPPERCASE, line-height 1.05, solid (never transparent).
  - Body: Archivo 100 width, 400, 18px, 1.55, `#CFCCC4`.
  - `.mono`: Space Mono, acid, uppercase, 13px minimum (spec lines, labels, breadcrumbs).
- Buttons: `.btn` is solid acid with black text, 14px radius, inset highlight, min height 56px, full width on mobile; never glass. `.btn-ghost` is the glass-look secondary. `.icon-btn` is a glass circle.
- Glass: `.glass` (cards/panels), `.glass-strong` (header, drawer, sticky bar), `.glass-accent` (hover/selected/featured), `.glass-hover` (accent + 4px lift on hover/focus/tap), `.glass-flat` (same look with NO backdrop-filter, for small chips/tiles).
  - Max about 8 backdrop-filter elements visible at once on mobile; use `.glass-flat` for small repeated items. Blur drops to 10px under 640px. Animate only transform and opacity. `@supports` fallback and `prefers-reduced-motion` are already in the CSS.
- Every section needs something behind the glass: use `<Blobs>` (glow blobs) inside a `relative isolate overflow-x-clip` section. Only the hero blobs float (`<Blobs float>`); keep the rest static for performance.
- Text sizes: mobile hero 40px+, section headings 30px+, product names 26px+ (36px+ on product pages), body 18px. Tap targets at least 48px.
- Header: floating glass pill (`components/Header.tsx`), sticky, 12px from the edges, logo 36px tall mobile / 44px desktop. Keep logos clear of other elements by half their own height on all sides. Hero logo is `min(80vw, 520px)` and slides in from the left over 500ms.
- Motion is subtle: fade-up on scroll (`<Reveal>`), yellow underline on link hover.

## Structure
- `app/(store)/page.tsx`: home (the storefront lives in the `(store)` route group, which adds the cart, announcement bar and tracking; the admin has its own layout) (hero with pouch photo panel, proof strip, lineup (4:5 cards), RED BURN feature band (`components/FeatureBand.tsx`, product set by `FEATURED_SLUG` in `config/site.ts`), how-to, why honey, value, FAQ, final CTA, footer). Lineup cards link to product pages.
- `app/(store)/products/[slug]/page.tsx`: product page template. `generateStaticParams` + `generateMetadata` (title, description, OG) + Product JSON-LD. `opengraph-image.tsx` makes a per-product OG image. Unknown slugs hit `app/not-found.tsx`.
- Product page order: breadcrumb → hero (gallery | name, descriptor, chips, description, price + per-sachet, flavour switcher, qty + ADD TO CART, trust row) → "12 sachets per pouch" flat-lay block (only if the product has a flat-lay photo) → What's inside (spec table + ingredients/allergens/warnings accordion) → How to use (sachet-open photo beside the steps) → Why this one (ingredients photo as a dimmed background) → Compare strip → FAQ → Final CTA. A product `warning` (e.g. GOLD caffeine notice) shows in the info column under the description, not in the FAQ.
- Product page components: `components/product/Gallery.tsx` (4:5 scroll-snap carousel, dots on mobile, thumbs on desktop, counter + zoom button in the top corners, full-screen zoom lightbox rendered in a portal with close button, swipe and arrow keys), `BuyBox.tsx` (qty, add to cart, mobile sticky bar that appears once the main button has scrolled above the viewport, via a scroll check, not IntersectionObserver; hides while the cart is open), `Sections.tsx` (everything else).
- Commerce: `components/CartProvider.tsx` (localStorage cart), `CartDrawer.tsx` (cart + checkout: delivery zone, discount code, cash on delivery), `app/actions/checkout.ts` (server action: validates, rate-limits, prices on the server, creates customer + order, deducts stock, returns the WhatsApp message), `lib/orders.ts` (quote, createOrder, setOrderStatus, stock). TODO: real payment gateway and delivery integration.
- Storefront data comes from `lib/catalog.ts` `getCatalog()` (database when configured, otherwise `config/*` as fallback). With no database, checkout is WhatsApp-only as before.
- Site-wide settings (currency, pouch price, WhatsApp number, Instagram, site URL): `config/site.ts`.
- Favicon, apple icon and OG images are generated from the M+ logo with `npm run icons`.

## Admin panel (`/admin`)
Shopify-style back office for the Lebanon store. Separate layout (`app/admin/layout.tsx`), `noindex` (meta + `X-Robots-Tag` in `proxy.ts` + `Disallow` in robots), protected by `proxy.ts` AND re-checked in every page/action/route with `requirePerm(...)` from `lib/auth.ts`.

**Rule: new admin pages reuse the same building blocks** from `components/admin/ui.tsx`: `Card`, `Money` (split-tone: whole part off-white, decimals muted), `Num`, `Delta`, `StatusBadge`/`PayBadge`, `PageHeader` (title + short gradient band), `DataTable` (table on desktop, stacked cards on phones), `Field`, `KV`, `Empty`, `ErrorState`. Forms use `ActionForm` + `SubmitButton` (`components/admin/ActionForm.tsx`, with a `confirm` prop for destructive actions). Charts use `BarChart`. Section tabs use `SubNav`. CSS classes: `.admin-card`, `.admin-band`, `.pill-btn` (+ `pill-light|lime|glass|danger`), `.status st-*`, `.a-input`, `.a-table`.

- **Stack/data:** Supabase (Postgres, Auth, Storage, Realtime). Schema + RLS in `supabase/migrations/0001_init.sql`. All data access goes through `lib/db` `getDb()` using the Supabase query-builder API (service-role key, server only, never in client code). With no Supabase env vars, development uses a local JSON-file store (`.data/`, same API; never active on Vercel). Env vars: `.env.example`.
- **Modes:** `dbMode()` is `supabase`, `local` (dev only) or `none` (production without Supabase: storefront falls back to config, admin shows "not configured").
- **Roles** (`lib/roles.ts`, `PERMS` map; mirrored in RLS): owner (everything, settings, team), manager (everything except settings/team), staff (orders, customers, inventory, view products). Check with `requirePerm("orders.write")` at the top of every page and server action. Add new permissions to `PERMS`.
- **Tables:** products, product_images, inventory_items, stock_movements, batches, customers, orders, order_items, order_events (timeline), discounts, shipping_zones, delivery_partners, abandoned_checkouts, events (funnel), pages_content (faq/announcement/hero/testimonials), settings (store/tracking/notifications/policies), admin_users, audit_log. Rows created by the demo generator carry `is_demo = true`.
- **Stock** only changes through the `adjust_stock` RPC (atomic, writes `stock_movements`). Orders deduct on creation (drafts deduct when confirmed); cancel/return restore. Prices, shipping and discounts are always computed on the server (`quoteOrder`).
- **Auditing:** call `audit(admin, action, entity, id, details)` (`lib/audit.ts`) for every important change. Never hard-delete business data: archive/disable instead.
- **Pages:** dashboard `/admin`; `orders` (list, `[id]`, `new`, `export`), `/admin/print` (packing slip/invoice); `products` (list, `new`, `[id]` with image manager); `inventory`; `customers`; `marketing` (overview, `discounts`, `content`); `analytics` (+`export`); `settings` (store, `shipping`, `team`, `activity`). Server actions live in an `actions.ts` next to each page.
- **Realtime/notifications:** `components/admin/NotificationBell.tsx` (Supabase Realtime on `orders` + 15s polling fallback, soft sound, mutable). Search: Cmd/Ctrl+K (`CommandPalette`, `/admin/api/search`).
- **Demo data:** Settings → "Load demo data" / "Wipe demo data" (owner). Wiping reverses its stock movements.
- First admin: `node --env-file=.env.local scripts/create-admin.mjs you@example.com "Name" owner`. Full setup steps: `ADMIN_SETUP.md`.
- Gotcha: in server actions, `redirect()` throws; don't swallow it in a `try/catch` (re-throw errors whose digest starts with `NEXT_REDIRECT`).

## Commands
- `npm run dev`, `npm run build`, `npm run icons`, `npm run images`, `node --env-file=.env.local scripts/create-admin.mjs <email> "<name>" owner`
- Gotcha: sections are `isolate` stacking contexts, so any `fixed` overlay rendered inside a section (sticky bar, lightbox) is trapped under later sections. Render those with `createPortal(..., document.body)`.
- Gotcha: write only the standard `backdrop-filter` in CSS (the build adds the Safari prefix). Writing both made the minifier drop the standard one, which silently disabled blur in Chrome/Edge.
- Gotcha: `.icon-btn` sets `position: relative` in unlayered CSS, so Tailwind `absolute` on it needs `!absolute`.
