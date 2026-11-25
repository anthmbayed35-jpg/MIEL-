import { COPY } from "./copy";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, SITE, WHATSAPP_NUMBER } from "./site";

/**
 * Default editable content. In production these live in the database (admin → Marketing → Content,
 * admin → Settings) and this file is the fallback / seed.
 */
export type FaqItem = { q: string; a: string };
export type Announcement = { enabled: boolean; text: string; link: string };
export type HeroContent = { headline1: string; headline2: string; sub: string };
export type Testimonial = { id: string; name: string; text: string; rating: number; approved: boolean };

export const DEFAULT_FAQ: FaqItem[] = COPY.homeFaq.map((f) => ({ ...f }));

export const DEFAULT_ANNOUNCEMENT: Announcement = { enabled: false, text: "Free delivery on orders over $60 in Beirut.", link: "" };
export const DEFAULT_HERO: HeroContent = { headline1: COPY.hero.headline1, headline2: COPY.hero.headline2, sub: COPY.hero.sub };

export type StoreSettings = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string; // digits only, international
  instagram_handle: string;
  instagram_url: string;
  currency: string;
  timezone: string;
  cod_enabled: boolean;
  free_delivery_note: string;
};
export const DEFAULT_STORE: StoreSettings = {
  name: SITE.name,
  email: "",
  phone: "",
  whatsapp: WHATSAPP_NUMBER,
  instagram_handle: INSTAGRAM_HANDLE,
  instagram_url: INSTAGRAM_URL,
  currency: "USD",
  timezone: "Asia/Beirut",
  cod_enabled: true,
  free_delivery_note: "",
};

export type TrackingSettings = { meta_pixel_id: string; ga4_id: string };
export const DEFAULT_TRACKING: TrackingSettings = { meta_pixel_id: "", ga4_id: "" };

export type NotificationSettings = { email: string; whatsapp_number: string; email_on_new_order: boolean; whatsapp_on_new_order: boolean };
export const DEFAULT_NOTIFICATIONS: NotificationSettings = { email: "", whatsapp_number: "", email_on_new_order: true, whatsapp_on_new_order: true };

export type Policies = { shipping: string; returns: string; privacy: string; terms: string };
export const DEFAULT_POLICIES: Policies = { shipping: "", returns: "", privacy: "", terms: "" };

/** Default Lebanon delivery zones. The delivery FEE is one flat setting (lib/delivery.ts); a zone only carries its free-delivery line. */
export const DEFAULT_ZONES = [
  { name: "Beirut", fee: 5, free_over: 60, eta: "Same day or next day", sort: 1 },
  { name: "Mount Lebanon", fee: 5, free_over: 70, eta: "1 to 2 days", sort: 2 },
  { name: "North Lebanon", fee: 5, free_over: 80, eta: "2 to 3 days", sort: 3 },
  { name: "South Lebanon", fee: 5, free_over: 80, eta: "2 to 3 days", sort: 4 },
  { name: "Nabatieh", fee: 5, free_over: 80, eta: "2 to 3 days", sort: 5 },
  { name: "Bekaa", fee: 5, free_over: 90, eta: "2 to 4 days", sort: 6 },
];
