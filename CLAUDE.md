# MIEL+ website

Lebanon-only honey sports-nutrition sachets. Next.js (App Router) + Tailwind 4, deployable to Vercel.
Tone: raw, performance-driven, short punchy copy. English only. No medical claims.

## Hard rules
- **New products are added only through `config/products.ts`.** The home lineup, `/products/[slug]` pages, compare strip, sitemap, metadata, JSON-LD and cart all read from it. Never hardcode a product elsewhere.
- **Never invent values.** Unknown nutrition, ingredients, allergens, shelf life and warnings are `null` in config and render as a clean `TBC`.
- Pouch price is one value: `POUCH_PRICE` in `config/site.ts`. Per-sachet price = `perSachet(price)` in `lib/format.ts` (price / 12, rounded to 2 decimals).
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
- Every section needs something behind the glass: use `<Blobs>` (glow blobs) inside a `relative isolate overflow-x-clip` section.
- Text sizes: mobile hero 40px+, section headings 30px+, product names 26px+ (36px+ on product pages), body 18px. Tap targets at least 48px.
- Header: floating glass pill (`components/Header.tsx`), sticky, 12px from the edges, logo 36px tall mobile / 44px desktop. Keep logos clear of other elements by half their own height on all sides. Hero logo is `min(80vw, 520px)` and slides in from the left over 500ms.
- Motion is subtle: fade-up on scroll (`<Reveal>`), yellow underline on link hover.

## Structure
- `app/page.tsx`: home (hero, proof strip, lineup, how-to, why honey, value, FAQ, final CTA, footer). Lineup cards link to product pages.
- `app/products/[slug]/page.tsx`: product page template. `generateStaticParams` + `generateMetadata` (title, description, OG) + Product JSON-LD. `opengraph-image.tsx` makes a per-product OG image. Unknown slugs hit `app/not-found.tsx`.
- Product page order: breadcrumb → hero (gallery | name, descriptor, chips, description, price + per-sachet, flavour switcher, qty + ADD TO CART, trust row) → What's inside (spec table + ingredients/allergens/warnings accordion) → How to use → Why this one → Compare strip → FAQ (caffeine notice block when `warning` is set) → Final CTA.
- Product page components: `components/product/Gallery.tsx` (scroll-snap carousel, dots on mobile, thumbs on desktop), `BuyBox.tsx` (qty, add to cart, mobile sticky bar that appears after the main button scrolls away and hides while the cart is open), `Sections.tsx` (everything else).
- Commerce: `components/CartProvider.tsx` (localStorage cart), `CartDrawer.tsx` (cart, checkout form, cash on delivery, WhatsApp order message), `lib/order.ts`. TODO there: real payment gateway and delivery integration.
- Site-wide settings (currency, pouch price, WhatsApp number, Instagram, site URL): `config/site.ts`.
- Favicon, apple icon and OG images are generated from the M+ logo with `npm run icons`.

## Commands
- `npm run dev`, `npm run build`, `npm run icons`
