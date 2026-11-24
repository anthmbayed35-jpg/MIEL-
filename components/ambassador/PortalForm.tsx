"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import type { PortalState } from "@/app/ambassador/actions";

export const field = "w-full min-h-14 bg-white/5 border border-white/15 px-4 py-3 text-fg text-[18px] placeholder:text-body/60 focus:border-acid focus:outline-none rounded-[14px]";
export const label = "mono block mb-2";

function Feedback({ state }: { state: PortalState }) {
  return (
    <>
      {state?.error && <p role="alert" className="rounded-2xl border border-[#FF5C7A]/50 bg-[#FF5C7A]/10 px-4 py-3 text-[17px] text-fg">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-2xl border border-acid/40 bg-acid/10 px-4 py-3 text-[17px] text-fg">{state.ok}</p>}
    </>
  );
}

/** A portal form bound to a server action returning { ok } or { error }. */
export function PortalForm({ action, children, submit, className = "" }: { action: (s: PortalState, fd: FormData) => Promise<PortalState>; children: ReactNode; submit: string; className?: string }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <form
      // submitted by hand (not as a form action) so a refused attempt keeps what the person typed (React would reset the fields)
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => act(fd));
      }}
      className={`space-y-5 ${className}`}
    >
      <Feedback state={state} />
      {children}
      <button type="submit" disabled={pending} className="btn">{pending ? "…" : submit}</button>
    </form>
  );
}

/** A one-button form (no fields) with feedback, e.g. "Request payout". */
export function ActionButton({ action, children, disabled, ghost }: { action: () => Promise<PortalState>; children: ReactNode; disabled?: boolean; ghost?: boolean }) {
  const [state, act, pending] = useActionState(async () => action(), null);
  return (
    <form action={act} className="space-y-3">
      <Feedback state={state} />
      <button type="submit" disabled={pending || disabled} className={ghost ? "btn-ghost" : "btn"}>{pending ? "…" : children}</button>
    </form>
  );
}

export function CopyButton({ value, children = "COPY" }: { value: string; children?: ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !min-h-12 !w-auto px-5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "COPIED" : children}
    </button>
  );
}
