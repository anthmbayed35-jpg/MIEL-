/** Lebanese phone numbers. Returns the normalised "+961XXXXXXXX" form, or null if invalid. */
export function normalizeLebanesePhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("961")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  // Mobile: 3xxxxxx (7 digits) or 70/71/76/78/79/81 + 6 digits (8 digits). Landline: area code 1, 4-9 + 6 digits.
  const ok = /^3\d{6}$/.test(d) || /^(70|71|76|78|79|81)\d{6}$/.test(d) || /^[14-9]\d{6}$/.test(d);
  return ok ? "+961" + d : null;
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
