"use client";

import Link from "next/link";

/** Storefront crash page: a plain apology. Never the error text, stack or digest-less internals. */
export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-24">
      <p className="mono mb-3">SOMETHING BROKE</p>
      <h1 className="display h-hero">
        Missed the <span className="accent">beat.</span>
      </h1>
      <p className="body-lg mt-5">Something went wrong on our side. Try again, or come back in a minute. Your cart is safe.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={reset} className="btn">
          TRY AGAIN
        </button>
        <Link href="/" className="btn btn-ghost">
          BACK HOME
        </Link>
      </div>
    </main>
  );
}
