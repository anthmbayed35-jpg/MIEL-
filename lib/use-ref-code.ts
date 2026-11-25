"use client";

import { useEffect, useState } from "react";
import { decodeRefEntry, encodeRef, parseRef, REF_KEY } from "@/lib/ref";

/**
 * An ambassador's personal link (/?ref=CODE): remember the code (browser storage, 30 days), count the visit once a day (a number,
 * no personal data) and hand the code to checkout. The server still checks it. A code typed by hand wins (see the checkout form).
 */
export function useRefCode(): { code: string; fromLink: boolean } {
  const [state, setState] = useState({ code: "", fromLink: false });
  useEffect(() => {
    try {
      const fromUrl = parseRef(window.location.search);
      const stored = decodeRefEntry(localStorage.getItem(REF_KEY));
      if (fromUrl) {
        const today = new Date().toISOString().slice(0, 10);
        const counted = stored?.code === fromUrl && stored.countedDay === today;
        localStorage.setItem(REF_KEY, encodeRef(fromUrl, Date.now(), today));
        if (!counted) void fetch("/api/ref", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: fromUrl }), keepalive: true }).catch(() => {});
      }
      const c = fromUrl ?? stored?.code ?? null;
      if (c) setState({ code: c, fromLink: true });
    } catch {
      /* storage blocked: the customer can still type the code */
    }
  }, []);
  return state;
}
