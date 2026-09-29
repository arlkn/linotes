// Regenerate README / store screenshots from the browser preview (sample notes).
// Usage: npm run dev   (in another terminal), then: node scripts/screenshots.mjs
import { chromium } from '@playwright/test';

const url = process.env.LINOTES_URL ?? 'http://localhost:1420';
const browser = await chromium.launch();

async function openNote(page, title) {
  await page.getByRole('listbox', { name: 'All Notes' }).getByText(title).click();
  await page.getByLabel('Note title').waitFor();
}

// [file name, colour scheme, how to get there]
const scenes = [
  ['linotes-light', 'light', (page) => openNote(page, 'Weekly planning')],
  ['linotes-dark', 'dark', (page) => openNote(page, 'Weekly planning')],
  [
    'linotes-markdown',
    'light',
    async (page) => {
      await openNote(page, 'Welcome to Linotes');
      await page.getByRole('radio', { name: 'Markdown' }).click();
      await page.waitForTimeout(300);
    },
  ],
  [
    'linotes-search',
    'dark',
    async (page) => {
      await openNote(page, 'Welcome to Linotes');
      await page.getByRole('searchbox', { name: 'Search notes' }).fill('markdown');
      await page.locator('mark').first().waitFor();
    },
  ],
  [
    'linotes-settings',
    'light',
    async (page) => {
      await openNote(page, 'Weekly planning');
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('dialog').waitFor();
    },
  ],
];

for (const [name, scheme, setUp] of scenes) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  await page.goto(url);
  await page.addStyleTag({ content: '[data-preview-banner]{display:none!important}' });
  await setUp(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  await page.close();
  console.log(`Saved docs/screenshots/${name}.png`);
}
await browser.close();
