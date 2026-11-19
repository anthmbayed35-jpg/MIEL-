import { beforeEach, describe, expect, it } from "vitest";
import { audit } from "@/lib/audit";
import { subscribe, type Stamped } from "@/lib/events";
import { resetState } from "../support/state";

beforeEach(() => resetState());

describe("every audited change reaches live admin screens", () => {
  it("audit() publishes a refresh event (products, discounts, settings, stock...) without a manual reload", async () => {
    const seen: Stamped[] = [];
    const off = subscribe((e) => seen.push(e));
    await audit({ id: "u", email: "o@t.test" }, "discount_update", "discount", "d1");
    await audit(null, "settings_update", "settings", "store");
    off();
    expect(seen.map((e) => e.type)).toEqual(["kpi.refresh", "kpi.refresh"]);
  });
});
