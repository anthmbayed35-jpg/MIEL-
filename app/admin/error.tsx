"use client";

/** Admin crash page: a calm message and a way out. The real error stays in the server log, never on screen. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-5 py-16">
      <h1 className="display text-[clamp(1.75rem,1.2rem+2.4vw,3rem)]">This page hit a problem</h1>
      <p className="mt-4 text-[16px] text-body">Nothing was lost. Try again, and if it keeps happening, note the time and tell whoever looks after the site.</p>
      {error.digest && <p className="mono mt-3">REF {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="pill-btn pill-lime">
          Try again
        </button>
        <a href="/admin" className="pill-btn pill-glass">
          Back to dashboard
        </a>
      </div>
    </main>
  );
}
