// Measure the interface with a large library in the browser preview.
// Usage: npm run dev   (in another terminal), then: node scripts/bench-ui.mjs [notes]
import { chromium } from '@playwright/test';

const url = process.env.LINOTES_URL ?? 'http://localhost:1420';
const count = Number(process.argv[2] ?? 5000);
const runs = 7;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const list = (name) => page.getByRole('listbox', { name });

let started = Date.now();
await page.goto(`${url}/?notes=${count}`);
await list('All Notes').getByRole('option').first().waitFor();
await page.getByLabel('Note title').waitFor();
const loaded = Date.now() - started;

/** Run `action` on the element in the page; time it until the next frame has been painted. */
async function timeInPage(locator, action) {
  return (await locator.elementHandle()).evaluate(async (element, action) => {
    const start = performance.now();
    if (action === 'click') element.click();
    else element.dispatchEvent(new KeyboardEvent('keydown', { key: action, bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return performance.now() - start;
  }, action);
}

const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const nav = (name) => page.getByRole('navigation', { name: 'Library' }).getByRole('button', { name });

const toAll = [];
for (let i = 0; i < runs; i += 1) {
  await timeInPage(nav(/^Favorites/), 'click');
  await list('Favorites').waitFor();
  toAll.push(await timeInPage(nav(/^All Notes/), 'click'));
  await list('All Notes').getByRole('option').first().waitFor();
}

const arrow = [];
await list('All Notes').focus();
for (let i = 0; i < runs; i += 1) {
  const selected = await list('All Notes').getAttribute('aria-activedescendant');
  started = performance.now();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    (before) => document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant') !== before,
    selected,
  );
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
  arrow.push(performance.now() - started);
}

console.log(`${count} notes (browser preview, Chromium)`);
console.log(`load until the list and editor show     ${loaded.toFixed(0).padStart(6)} ms`);
console.log(`switch to All Notes (median)            ${median(toAll).toFixed(1).padStart(6)} ms`);
console.log(`↓ to the next note (median)             ${median(arrow).toFixed(1).padStart(6)} ms`);
await browser.close();
