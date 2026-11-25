import type { PlaceInput } from "@/app/actions/checkout";

/** A valid /checkout submission (Beirut), as the checkout form sends it. Override any part. */
export function checkoutInput(productId: string, over: Partial<PlaceInput> & { qty?: number; name?: string; phone?: string } = {}): PlaceInput {
  const { qty = 1, name = "Test Customer", phone = "03 123 456", ...rest } = over;
  return {
    items: [{ productId, qty }],
    customer: { name, phone },
    delivery: { governorate: "Beirut", district: "Beirut", street: "Hamra Street, Bldg 5, floor 3", landmark: "", notes: "" },
    paymentMethod: "cod",
    code: "",
    ...rest,
  };
}
