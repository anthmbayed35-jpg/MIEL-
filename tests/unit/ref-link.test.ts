import { describe, expect, it } from "vitest";
import { decodeRef, encodeRef, parseRef, REF_DAYS } from "@/lib/ref";

describe("affiliate personal link (?ref=CODE)", () => {
  it("reads the code, case-insensitively, from any query string", () => {
    expect(parseRef("?ref=rami10")).toBe("RAMI10");
    expect(parseRef("?utm_source=ig&ref=Rami10&x=1")).toBe("RAMI10");
    expect(parseRef("?ref=%20abc%20")).toBe("ABC");
  });
  it("ignores anything that is not shaped like a code", () => {
    for (const bad of ["", "?", "?ref=", "?ref=ab", "?ref=<script>", "?ref=a b c", "?ref=" + "x".repeat(21), "?ref=ré10", "?other=RAMI10", "?ref=RAMI10;DROP"]) expect(parseRef(bad), bad).toBeNull();
  });
  it("is remembered for 30 days and no longer", () => {
    const t = Date.UTC(2026, 10, 1);
    const raw = encodeRef("RAMI10", t);
    expect(decodeRef(raw, t + 1000)).toBe("RAMI10");
    expect(decodeRef(raw, t + (REF_DAYS - 1) * 86_400_000)).toBe("RAMI10");
    expect(decodeRef(raw, t + (REF_DAYS + 1) * 86_400_000)).toBeNull();
  });
  it("garbage in storage never throws and never yields a code", () => {
    for (const bad of [null, "", "nope", "{}", "[]", '{"code":5,"at":1}', '{"code":"<x>","at":1}', '{"code":"RAMI10"}', '{"code":"RAMI10","at":99999999999999}']) expect(decodeRef(bad as string | null, Date.UTC(2026, 10, 1)), String(bad)).toBeNull();
  });
});
