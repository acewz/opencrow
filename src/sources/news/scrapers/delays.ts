/** Human-like delay and scroll utilities for browser scraping. */

import type { Page } from "playwright";

/** Sleep for a random duration between min and max seconds. */
export async function randomDelay(
  minS: number = 0.5,
  maxS: number = 2.0,
): Promise<void> {
  const ms = (minS + Math.random() * (maxS - minS)) * 1000;
  await Bun.sleep(ms);
}

/** Scroll page by a random distance (300-700px) with a pause. */
export async function humanScroll(page: Page): Promise<void> {
  const distance = 300 + Math.floor(Math.random() * 400);
  await page.evaluate(`window.scrollBy(0, ${distance})`);
  await randomDelay(1.5, 3.5);
}

/** Scroll to bottom incrementally. */
export async function scrollToBottom(
  page: Page,
  maxScrolls: number = 5,
): Promise<void> {
  for (let i = 0; i < maxScrolls; i++) {
    await humanScroll(page);
  }
}

/** Move mouse to a random position on screen. */
export async function randomMouseMove(page: Page): Promise<void> {
  const x = 100 + Math.floor(Math.random() * 1100);
  const y = 100 + Math.floor(Math.random() * 600);
  await page.mouse.move(x, y);
}
