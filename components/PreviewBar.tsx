import Link from "next/link";

/**
 * Shown on every storefront page, to a signed-in admin only, while SITE_MODE=maintenance: the real storefront is visible
 * to this browser session and nobody else. Sticky at the very top; the floating header is moved below it (globals.css).
 */
export function PreviewBar() {
  return (
    <div role="status" data-preview-bar className="sticky top-0 z-[70] flex min-h-12 flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-acid px-4 py-2 text-center text-[14px] font-semibold text-black">
      <span>Preview mode: only you can see this.</span>
      <span className="hidden font-normal sm:inline">Visitors see the under-development page. Orders here are TEST orders only.</span>
      <Link href="/admin" className="underline underline-offset-2">
        Back to admin
      </Link>
    </div>
  );
}
