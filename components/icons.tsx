/**
 * One small line-icon set: 24x24, stroke 1.75, round caps and joins, currentColor, no fills. Used by the usage guide.
 * Decorative (aria-hidden): the card text carries the meaning.
 */
const base = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** BEFORE: a circle with an arrow going out. */
export const IconBefore = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M8 12h8M13 8l4 4-4 4" /></svg>
);
/** DURING: a running line with a flag at the end. */
export const IconDuring = () => (
  <svg {...base}><path d="M3 18c3-9 5 0 8-6s5 3 8-5" /><path d="M19 3v6M19 3l-3 1.5L19 6" /></svg>
);
/** EVERY DAY: a calendar with a tick. */
export const IconEveryDay = () => (
  <svg {...base}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4" /></svg>
);
/** ON THE GO: a small bag. */
export const IconOnTheGo = () => (
  <svg {...base}><path d="M7 8V6a5 5 0 0 1 10 0v2" /><rect x="4.5" y="8" width="15" height="12" rx="3" /><path d="M9 13h6" /></svg>
);
