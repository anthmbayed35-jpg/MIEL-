"use client";

import { useState } from "react";
import { regenerateRecoveryCodes, type EnrollResult } from "@/app/admin/(flow)/mfa/actions";

/** Make a fresh set of one-time recovery codes (the old ones stop working). Shown once. */
export function RecoveryCodes() {
  const [res, setRes] = useState<EnrollResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Make new recovery codes? The old ones stop working.")) return;
          setBusy(true);
          setRes(await regenerateRecoveryCodes());
          setBusy(false);
        }}
        className="pill-btn pill-glass"
      >
        {busy ? "Working…" : "New recovery codes"}
      </button>
      {res?.error && <p role="alert" className="text-[15px] text-[#ff8aa0]">{res.error}</p>}
      {res?.codes && (
        <>
          <p role="status" className="text-[15px] text-acid">{res.ok}</p>
          <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-white/15 bg-white/5 p-4 font-mono text-[15px] text-fg" aria-label="Recovery codes">
            {res.codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
