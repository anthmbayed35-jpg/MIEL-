/**
 * Four larger line illustrations for the "Why honey" cards. Same style as components/icons.tsx: one stroke width (1.5 on a 64 grid),
 * round caps and joins, currentColor, no fills. Decorative (aria-hidden): the card text carries the meaning.
 */
const base = { width: 64, height: 64, viewBox: "0 0 64 64", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** No mixing, no scoop: a crossed-out shaker. */
export const DrawNoMixing = () => (
  <svg {...base}>
    <path d="M22 18h20l-2 8v26a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V26l-2-8Z" />
    <path d="M24 12h16v6H24zM26 34h12M26 42h12" />
    <path d="M10 54 54 10" />
  </svg>
);
/** Pocket-size, tear open: a sachet with a notch and a tear line. */
export const DrawSachet = () => (
  <svg {...base}>
    <path d="M18 14h28v36a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V14Z" />
    <path d="M18 22h28" strokeDasharray="3 4" />
    <path d="M46 22l-5-3M46 22l-5 3" />
    <path d="M26 34h12M26 41h8" />
  </svg>
);
/** The dose is decided for you: a measuring scale with a fixed mark. */
export const DrawDose = () => (
  <svg {...base}>
    <path d="M14 46V22M14 46h36M14 22h6M14 30h10M14 38h6" />
    <rect x="30" y="26" width="18" height="20" rx="3" />
    <path d="M30 34h18" />
  </svg>
);
/** Raw honey as the base: a honey drop on a comb cell. */
export const DrawHoney = () => (
  <svg {...base}>
    <path d="M32 10c-8 12-13 18-13 25a13 13 0 0 0 26 0c0-7-5-13-13-25Z" />
    <path d="M26 38a6 6 0 0 0 6 6" />
    <path d="M10 54h44" />
  </svg>
);
