"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishEnroll, startEnroll, type EnrollResult, type EnrollStart } from "@/app/admin/(flow)/mfa/actions";

/** Authenticator-app (TOTP) setup: shows the QR code, then asks for the first 6-digit code. */
export function MfaEnroll() {
  const router = useRouter();
  const [start, setStart] = useState<EnrollStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<EnrollResult | null>(null);

  async function begin() {
    setBusy(true);
    setMsg(null);
    setStart(await startEnroll());
    setBusy(false);
  }
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!start || !start.ok) return;
    setBusy(true);
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    const r = await finishEnroll(start.factorId, code);
    setMsg(r);
    setBusy(false);
  }

  if (msg?.codes)
    return (
      <div className="space-y-4">
        <p role="status" className="text-[15px] text-acid">{msg.ok}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-white/15 bg-white/5 p-4 font-mono text-[15px] text-fg" aria-label="Recovery codes">
          {msg.codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <p className="text-[14px] text-body">Each code works once if you lose your phone. Store them somewhere safe (a password manager, or printed).</p>
        <button type="button" onClick={() => { router.replace("/admin"); router.refresh(); }} className="pill-btn pill-lime">I saved them, continue</button>
      </div>
    );
  if (!start || !start.ok)
    return (
      <div>
        {start && !start.ok && <p role="alert" className="mb-3 text-[15px] text-[#ff8aa0]">{start.error}</p>}
        <button onClick={begin} disabled={busy} className="pill-btn pill-lime">{busy ? "Working…" : "Set up two-factor authentication"}</button>
      </div>
    );
  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-[15px] text-body">1. Open an authenticator app (Google Authenticator, 1Password, Authy). 2. Scan this code. 3. Enter the 6-digit code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={start.qr} alt="Two-factor setup QR code" width={192} height={192} className="rounded-2xl bg-white p-2" />
      <p className="mono !text-[12px] !text-body break-all">Can&apos;t scan? Secret: {start.secret}</p>
      <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required placeholder="123456" className="a-input !max-w-48 text-center !text-[22px] tracking-[0.3em]" aria-label="6-digit code" />
      {msg?.error && <p role="alert" className="text-[15px] text-[#ff8aa0]">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-[15px] text-acid">{msg.ok}</p>}
      <button disabled={busy} className="pill-btn pill-lime">{busy ? "Checking…" : "Verify and turn on"}</button>
    </form>
  );
}
