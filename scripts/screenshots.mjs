// Regenerate README / store screenshots from the browser preview (sample notes).
// Usage: npm run dev   (in another terminal), then: node scripts/screenshots.mjs
import { chromium } from '@playwright/test';

const url = process.env.LINOTES_URL ?? 'http://localhost:1420';
const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  await page.goto(url);
  await page.addStyleTag({ content: '[data-preview-banner]{display:none!important}' });
  await page.getByRole('listbox', { name: 'All Notes' }).getByText('Weekly planning').click();
  await page.getByLabel('Note title').waitFor();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/screenshots/linotes-${scheme}.png` });
  await page.close();
}
await browser.close();
console.log('Saved docs/screenshots/linotes-light.png and linotes-dark.png');
