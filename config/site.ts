// Single place for all store-wide settings. Edit values here.

export const SITE = {
  name: "MIEL+",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://miel-plus.vercel.app", // TODO: real domain
  description:
    "MIEL+ is honey-based sports nutrition in single-serve sachets. Made for training and running. Delivered across Lebanon.",
};

/** Product shown in the home page feature band and hero. */
export const FEATURED_SLUG = "red-burn";

export const CURRENCY = "USD";
export const CURRENCY_SYMBOL = "$";

/** One pouch = this many sachets. */
export const SACHETS_PER_POUCH = 12;

/** Pouch price. Change this one number to test $25 / $30 / $35. */
export const POUCH_PRICE = 30;

// TODO: replace placeholders
export const WHATSAPP_NUMBER = "96100000000"; // international format, digits only, no "+"
export const INSTAGRAM_HANDLE = "@mielplus"; // TODO: real handle
export const INSTAGRAM_URL = "https://instagram.com/mielplus"; // TODO: real URL
