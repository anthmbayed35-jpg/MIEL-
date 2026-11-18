"use client";

import { useEffect } from "react";
import { captureUtm, trackEvent } from "@/lib/track-client";

/** Records one "visit" per browser session and remembers UTM params for attribution on orders. */
export function Tracker() {
  useEffect(() => {
    captureUtm();
    try {
      if (!sessionStorage.getItem("miel_visit")) {
        sessionStorage.setItem("miel_visit", "1");
        trackEvent("visit");
      }
    } catch {}
  }, []);
  return null;
}
