/**
 * Lebanon delivery geography helpers. The places themselves (8 governorates, 26 districts, every region) live in the `locations`
 * table (migration 0010, official open data; lib/locations.ts). What stays here is pure and shared with the browser.
 */

/**
 * The delivery zone (Settings > Shipping & delivery) behind each governorate, by its official code. A zone only carries the
 * free-delivery line now: the delivery FEE is one flat amount for everyone (lib/delivery.ts), so this is NOT zone pricing.
 */
export const GOVERNORATE_ZONE: Record<string, string> = {
  LB1: "Beirut",
  LB2: "Bekaa", // Bekaa
  LB3: "Mount Lebanon",
  LB4: "Nabatieh", // El Nabatieh
  LB5: "North Lebanon",
  LB6: "South Lebanon",
  LB7: "North Lebanon", // Akkar
  LB8: "Bekaa", // Baalbek-El Hermel
};

export const zoneForGovernorate = (governorateId: string): string => GOVERNORATE_ZONE[governorateId] ?? "";

/** One readable address line for slips, WhatsApp and emails. */
export function addressLine(a: { street: string; region?: string; district: string; governorate: string; landmark?: string }): string {
  const place = [a.region, a.district !== a.governorate ? a.district : "", a.governorate].filter((x, i, all) => x && all.indexOf(x) === i).join(", ");
  return [a.street.trim(), place, a.landmark?.trim() ? `Near ${a.landmark.trim()}` : ""].filter(Boolean).join(" · ");
}

export const HEARD_FROM_OPTIONS = ["Instagram", "A friend", "An athlete or creator", "Other"] as const;

/** Google Maps search for a text address (no API key needed). */
export const mapsSearchUrl = (text: string): string => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
/** Google Maps link for a pin. */
export const mapsPinUrl = (lat: number, lon: number): string => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
