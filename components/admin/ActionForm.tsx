"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Flash } from "./ui";

export type ActionState = { ok?: string; error?: string } | null;

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
