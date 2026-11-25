import { describe, expect, it } from "vitest";
import { foldArabic, foldEnglish, placeMatches, rankPlaces } from "../../lib/search-text";

describe("place search (English and Arabic)", () => {
  it("English ignores accents, case and punctuation", () => {
    expect(foldEnglish("Zahlé")).toBe("zahle");
    expect(foldEnglish("Baalbek-El Hermel")).toBe("baalbek el hermel");
    expect(placeMatches({ en: "Zahle" }, "zahlé")).toBe(true);
    expect(placeMatches({ en: "Deir El Balamand" }, "balam")).toBe(true);
    expect(placeMatches({ en: "Deir El Balamand" }, "xyz")).toBe(false);
    expect(placeMatches({ en: "Anything" }, "")).toBe(true);
    expect(placeMatches({ en: "Anything" }, "   ")).toBe(true);
  });

  it("Arabic ignores diacritics, tatweel and letter variants", () => {
    expect(foldArabic("عاليَه")).toBe(foldArabic("عالية"));
    expect(foldArabic("أبو سمرا")).toBe(foldArabic("ابو سمرا"));
    expect(foldArabic("مرجعيون")).toBe(foldArabic("مرجعيون"));
    expect(placeMatches({ en: "Baalbek", ar: "بعلبك" }, "بعلب")).toBe(true);
    expect(placeMatches({ en: "Baalbek", ar: "بعلبك" }, "صور")).toBe(false);
    expect(placeMatches({ en: "Aley", ar: "عاليه" }, "عالية")).toBe(true); // ta marbuta and ha are the same for search
  });

  it("a name with no Arabic never matches an Arabic query, and an English query never needs Arabic", () => {
    expect(placeMatches({ en: "Aley" }, "عاليه")).toBe(false);
    expect(placeMatches({ en: "Aley" }, "ale")).toBe(true);
  });

  it("results that START with the query come first", () => {
    const places = [{ en: "Deir Aley" }, { en: "Aley" }, { en: "Kfar Aley" }, { en: "Aleyh" }];
    expect(rankPlaces(places, "aley").map((p) => p.en)).toEqual(["Aley", "Aleyh", "Deir Aley", "Kfar Aley"]);
  });
});
