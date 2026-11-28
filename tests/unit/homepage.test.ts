import { describe, expect, it } from "vitest";
import { enabledSections, HOME_SECTIONS, type HomeSection } from "../../config/homepage";

describe("config/homepage.ts", () => {
  it("lists the sections in the agreed order, each once, all enabled by default", () => {
    expect(HOME_SECTIONS.map((s) => s.id)).toEqual(["hero", "ticker", "moments", "lineup", "features", "explorer", "why-honey", "compare", "usage", "story", "community", "faq", "closing", "ambassador"]);
    expect(new Set(HOME_SECTIONS.map((s) => s.id)).size).toBe(HOME_SECTIONS.length);
    expect(HOME_SECTIONS.every((s) => s.enabled)).toBe(true);
  });

  it("reordering or disabling a section needs no component change", () => {
    const list: HomeSection[] = [
      { id: "faq", enabled: true },
      { id: "hero", enabled: true },
      { id: "compare", enabled: false },
    ];
    expect(enabledSections(list)).toEqual(["faq", "hero"]);
  });
});
