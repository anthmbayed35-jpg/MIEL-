import type { Page } from "@playwright/test";

/** Choose a place in one of the searchable checkout selectors: tap it, type to filter, tap the match. */
export async function pickPlace(page: Page, selector: string, text: string) {
  const input = page.locator(selector);
  await input.click();
  await input.fill(text);
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: text }).first().click();
}

/** Governorate, then district, then a region: the one named `region`, or the first one in the list. */
export async function chooseLocation(page: Page, governorate: string, district: string, region?: string) {
  await pickPlace(page, "#governorate", governorate);
  await pickPlace(page, "#district", district);
  const input = page.locator("#region");
  await input.click();
  if (region) {
    await input.fill(region);
    await page.locator('[role="listbox"] [role="option"]').filter({ hasText: region }).first().click();
  } else {
    await page.locator('[role="listbox"] [role="option"]').first().click();
  }
}
