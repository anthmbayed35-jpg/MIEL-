/**
 * THE HOME PAGE, as an ordered list of sections. Reorder the list or set enabled: false to move or hide a section: no component changes.
 * A section that has no real content (no story film, no approved reviews or photos, no confirmed answers) is hidden automatically by
 * app/(store)/page.tsx, whatever its flag says: it is never rendered empty and never filled with placeholder reviews.
 *
 * Each id is also the anchor of the section where it has one (#moments, #shop, #how-it-works, #story, #faq).
 * The announcement strip and the header are not sections: they come from the store layout.
 */
export type HomeSectionId =
  | "hero"
  | "ticker"
  | "moments"
  | "lineup"
  | "features"
  | "explorer"
  | "why-honey"
  | "compare"
  | "usage"
  | "story"
  | "community"
  | "faq"
  | "closing"
  | "ambassador";

export type HomeSection = { id: HomeSectionId; enabled: boolean };

export const HOME_SECTIONS: HomeSection[] = [
  { id: "hero", enabled: true },
  { id: "ticker", enabled: true },
  { id: "moments", enabled: true },
  { id: "lineup", enabled: true },
  { id: "features", enabled: true },
  { id: "explorer", enabled: true },
  { id: "why-honey", enabled: true },
  { id: "compare", enabled: true },
  { id: "usage", enabled: true },
  { id: "story", enabled: true },
  { id: "community", enabled: true },
  { id: "faq", enabled: true },
  { id: "closing", enabled: true },
  { id: "ambassador", enabled: true },
];

/** The section ids in render order (enabled ones only). */
export const enabledSections = (list: HomeSection[] = HOME_SECTIONS): HomeSectionId[] => list.filter((s) => s.enabled).map((s) => s.id);
