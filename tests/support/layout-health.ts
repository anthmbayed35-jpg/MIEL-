import type { Page } from "@playwright/test";

/**
 * Layout health of the page as rendered: horizontal overflow, clipped text, overlapping text, empty cards/sections and unexplained gaps
 * between sections. Returns a list of problems (empty = healthy). Scroll the page first so scroll reveals have run.
 */
export function layoutReport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
  const out: string[] = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`horizontal overflow ${document.documentElement.scrollWidth} > ${vw}`);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const label = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
  // clipped text: a text element whose content is wider than its box and does not wrap or scroll on purpose
  for (const el of document.querySelectorAll("h1,h2,h3,p,li,a,button,summary,dt,dd")) {
    if (!visible(el) || el.closest(".marquee-track,.ticker-track,[aria-hidden='true']")) continue;
    const e = el as HTMLElement;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && (cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.textOverflow === "ellipsis")) out.push(`clipped ${label(el)}`);
  }
  // overlapping text: leaf text elements that cross each other (skip fixed/sticky bars, marquee, hidden)
  const leaves = [...document.querySelectorAll("h1,h2,h3,p,li,span,a,button,dt,dd")].filter((el) => {
    if (!visible(el) || el.closest(".marquee-track,.ticker-track,.site-header,[data-announcement-strip],[aria-hidden='true'],details:not([open]) > :not(summary)")) return false;
    if (el.children.length && [...el.children].some((c) => visible(c) && (c.textContent ?? "").trim())) return false;
    let n: Element | null = el;
    while (n) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return false;
      n = n.parentElement;
    }
    return (el.textContent ?? "").trim().length > 1;
  });
  const rects = leaves.map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r;
      const b = rects[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 3 && h > 3 && !rects[i].el.contains(rects[j].el) && !rects[j].el.contains(rects[i].el)) out.push(`overlap ${label(rects[i].el)} / ${label(rects[j].el)}`);
    }
  // blank gaps: a section or card with nothing in it, or an unexplained empty band
  for (const el of document.querySelectorAll("main section, main .glass, main .glass-flat")) {
    if (!visible(el)) continue;
    const hasContent = (el as HTMLElement).innerText.trim().length > 2 || el.querySelector("img,picture,svg");
    if (!hasContent) out.push(`empty ${label(el)} ${Math.round(el.getBoundingClientRect().height)}px`);
  }
  const secs = [...document.querySelectorAll("main > section")].filter(visible);
  for (let i = 1; i < secs.length; i++) {
    const gap = secs[i].getBoundingClientRect().top - secs[i - 1].getBoundingClientRect().bottom;
    if (gap > 40) out.push(`gap ${Math.round(gap)}px between sections ${i - 1} and ${i}`);
  }
  return out;
  });
}

/** Scrolls the whole page once (so scroll reveals and lazy images run), then back to the top. */
export async function scrollThrough(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}
