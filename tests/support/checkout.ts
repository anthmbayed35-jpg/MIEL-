import type { PlaceInput } from "@/app/actions/checkout";
import { getEngine } from "../../lib/db/core";

/** District ids (official codes) used by the tests. */
export const D = { beirut: "LB11", meten: "LB36", zahle: "LB25", akkar: "LB51", sidon: "LB61", baalbek: "LB21", tripoli: "LB56", nabatieh: "LB44" } as const;

/** The delivery part of a valid checkout: the nth visible region (alphabetical) of a district, with its governorate. Override any part. */
export function deliveryTo(districtId: string = D.beirut, nth = 0, over: Partial<PlaceInput["delivery"]> = {}): PlaceInput["delivery"] {
  const sql = getEngine().sqlite;
  const d = sql.prepare("SELECT id, parent_id FROM locations WHERE id = ? AND type = 'district'").get(districtId) as { id: string; parent_id: string };
  const r = sql.prepare("SELECT id FROM locations WHERE parent_id = ? AND type = 'region' AND hidden = 0 ORDER BY name_en LIMIT 1 OFFSET ?").get(districtId, nth) as { id: string };
  return { governorateId: d.parent_id, districtId: d.id, regionId: r.id, street: "Hamra Street, Bldg 5, floor 3", landmark: "", notes: "", ...over };
}

/** A valid /checkout submission (Beirut), as the checkout form sends it. Override any part. */
export function checkoutInput(productId: string, over: Partial<PlaceInput> & { qty?: number; name?: string; phone?: string } = {}): PlaceInput {
  const { qty = 1, name = "Test Customer", phone = "03 123 456", ...rest } = over;
  return {
    items: [{ productId, qty }],
    customer: { name, phone },
    delivery: deliveryTo(D.beirut),
    paymentMethod: "cod",
    code: "",
    ...rest,
  };
}
