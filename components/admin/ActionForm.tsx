"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Flash } from "./ui";

/** `copy`: a one-time link the owner must hand over by hand (shown while email is not configured). */
export type ActionState = { ok?: string; error?: string; copy?: { label: string; value: string } } | null;

function CopyBox({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mb-4 rounded-2xl border border-acid/40 bg-acid/5 p-3" role="group" aria-label={label}>
      <p className="mono mb-2">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} className="a-input !text-[13px]" />
        <button
          type="button"
          className="pill-btn pill-lime shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
            } catch {
              setDone(false); // clipboard blocked: the text above is selectable
            }
          }}
        >
          {done ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="mt-2 text-[13px] text-body">Shown once. Send it to them yourself (WhatsApp, in person). It works one time only.</p>
    </div>
  );
}

/** Form bound to a server action that returns { ok } or { error }, with inline feedback. */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    return r ? { ...r, ts: Date.now() } : r;
  }, null as ActionState);
  return (
    <form
      action={formAction}
      className={className}
      ref={(el) => {
        if (el && resetOnSuccess && state?.ok) el.reset();
      }}
    >
      <Flash msg={state?.ok} error={state?.error} />
      {state?.copy && <CopyBox label={state.copy.label} value={state.copy.value} />}
      {children}
    </form>
  );
}

/** Submit button with pending state. `confirm` asks before running destructive actions. */
export function SubmitButton({
  children,
  variant = "lime",
  confirm,
  className = "",
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "lime" | "light" | "glass" | "danger";
  confirm?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`pill-btn pill-${variant} ${className}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
