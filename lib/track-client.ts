"use client";

// First-party funnel events + UTM capture. No cookies, no personal data.
export type TrackType = "visit" | "add_to_cart" | "begin_checkout";

function session(): string {
  try {
    let s = sessionStorage.getItem("miel_sid");
    if (!s) {
      s = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem("miel_sid", s);
    }
    return s;
  } catch {
    return "";
  }
}

export function captureUtm() {
  try {
    const q = new URLSearchParams(location.search);
    const u = { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") };
    if (u.source || u.medium || u.campaign) sessionStorage.setItem("miel_utm", JSON.stringify(u));
  } catch {}
}

export function getUtm(): { source?: string; medium?: string; campaign?: string } {
  try {
    return JSON.parse(sessionStorage.getItem("miel_utm") ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function trackEvent(type: TrackType) {
  try {
    const body = JSON.stringify({ type, session: session(), path: location.pathname, utm: getUtm().source ?? null });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", body, keepalive: true });
  } catch {}
}
