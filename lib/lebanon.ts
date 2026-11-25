/**
 * Lebanon delivery geography: the 8 governorates and their districts (qadas), and which delivery zone (Settings > Shipping)
 * prices each governorate. Pure data, shared by the checkout form (dependent dropdowns) and the server (which re-checks everything).
 * A governorate whose zone is missing or switched off in the admin is simply not offered.
 */
export const GOVERNORATES: { name: string; zone: string; districts: string[] }[] = [
  { name: "Beirut", zone: "Beirut", districts: ["Beirut"] },
  { name: "Mount Lebanon", zone: "Mount Lebanon", districts: ["Aley", "Baabda", "Chouf", "Jbeil (Byblos)", "Keserwan", "Matn"] },
  { name: "North", zone: "North Lebanon", districts: ["Batroun", "Bsharri", "Koura", "Minieh-Danniyeh", "Tripoli", "Zgharta"] },
  { name: "Akkar", zone: "North Lebanon", districts: ["Akkar"] },
  { name: "Baalbek-Hermel", zone: "Bekaa", districts: ["Baalbek", "Hermel"] },
  { name: "Beqaa", zone: "Bekaa", districts: ["Rashaya", "West Beqaa", "Zahle"] },
  { name: "South", zone: "South Lebanon", districts: ["Jezzine", "Sidon", "Tyre"] },
  { name: "Nabatieh", zone: "Nabatieh", districts: ["Bint Jbeil", "Hasbaya", "Marjayoun", "Nabatieh"] },
];

export const governorate = (name: string) => GOVERNORATES.find((g) => g.name === name);

/** The delivery zone name for a governorate + district pair, or null when the pair is not valid. */
export function zoneFor(gov: string, district: string): string | null {
  const g = governorate(gov);
  return g && g.districts.includes(district) ? g.zone : null;
}

/** One readable address line for slips, WhatsApp and emails. */
export function addressLine(a: { street: string; district: string; governorate: string; landmark?: string }): string {
  const place = a.district === a.governorate ? a.district : `${a.district}, ${a.governorate}`;
  return [a.street.trim(), place, a.landmark?.trim() ? `Near ${a.landmark.trim()}` : ""].filter(Boolean).join(" · ");
}

export const HEARD_FROM_OPTIONS = ["Instagram", "A friend", "An athlete or creator", "Other"] as const;
