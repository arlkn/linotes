import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeVisible();
  await expect(page.getByLabel('Note title')).toHaveValue('Welcome to Linotes');
}

test('write a note with Markdown shortcuts and see it as Markdown', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+n');
  const title = page.getByLabel('Note title');
  await expect(title).toBeFocused();
  await page.keyboard.type('Sprint review');
  await page.keyboard.press('Enter');

  const body = page.getByRole('textbox', { name: 'Note content' });
  await expect(body).toBeFocused();
  await page.keyboard.type('## Agenda');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[ ] Ship **search** today');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Check `cargo test`');

  await expect(body.locator('h2')).toHaveText('Agenda');
  await expect(body.locator('ul[data-type="taskList"] li')).toHaveCount(2);
  await expect(body.locator('strong')).toHaveText('search');

  await page.getByRole('radio', { name: 'Markdown' }).click();
  const source = page.getByLabel('Markdown source');
  await expect(source).toContainText('## Agenda');
  await expect(source).toContainText('- [ ] Ship **search** today');
  await expect(source).toContainText('- [ ] Check `cargo test`');

  await expect(page.getByRole('listbox', { name: 'All Notes' }).getByText('Sprint review')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 5000 });
});

test('search from the keyboard', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+f');
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();
  await page.keyboard.type('pul biber');
  const results = page.getByRole('listbox', { name: 'Search' });
  await expect(results.getByRole('option')).toHaveCount(1);
  await expect(results.locator('mark').first()).toHaveText(/pul/i);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Note title')).toHaveValue('Menemen');
  await page.getByRole('searchbox', { name: 'Search notes' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'All Notes' })).toBeVisible();
});

test('create a folder and move a note into it by drag and drop', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+Shift+n');
  const dialog = page.getByRole('dialog', { name: 'New Folder' });
  await dialog.getByLabel('Folder name').fill('Ideas');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Ideas' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: /^All Notes/ })
    .click();
  const note = page
    .getByRole('listbox', { name: 'All Notes' })
    .getByRole('option')
    .filter({ hasText: 'Reading list' });
  await note.dragTo(page.getByRole('button', { name: /^Ideas/ }));
  await expect(page.getByText('Moved to Ideas')).toBeVisible();
  await page.getByRole('button', { name: /^Ideas/ }).click();
  await expect(page.getByRole('listbox', { name: 'Ideas' }).getByText('Reading list')).toBeVisible();
});

test('trash and restore from the context menu', async ({ page }) => {
  await openApp(page);
  const list = page.getByRole('listbox', { name: 'All Notes' });
  await list.getByRole('option').filter({ hasText: 'Menemen' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(list.getByText('Menemen')).toHaveCount(0);
  await page
    .getByRole('status')
    .filter({ hasText: 'Moved to Trash' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(list.getByText('Menemen')).toBeVisible();
});

test('theme and zoom preferences apply immediately', async ({ page }) => {
  await openApp(page);
  await page.getByRole('navigation', { name: 'Library' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Equal');
  await expect(page.locator('html')).toHaveCSS('font-size', '17.6px');
  await page.keyboard.press('Control+0');
  await expect(page.locator('html')).toHaveCSS('font-size', '16px');
});

test('narrow windows hide the sidebar behind a button', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeHidden();
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeVisible();
  await page.getByRole('button', { name: /^Favorites/ }).click();
  await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeHidden();
});

test('go to a note by title with Ctrl+P', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+p');
  const box = page.getByRole('combobox', { name: 'Go to note' });
  await box.fill('arch');
  await expect(page.getByRole('option', { name: /Linotes architecture/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(box).toBeHidden();
  await expect(page.getByLabel('Note title')).toHaveValue('Linotes architecture');
  await expect(page.locator('.ProseMirror')).toBeFocused();
});

// A 1×1 PNG, so the browser can really decode what was added.
const DOT_PNG = [
  ...Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
];

test('paste and drop images into a note', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Pictures');
  await page.keyboard.press('Enter');
  const body = page.locator('.ProseMirror');

  await body.evaluate((element, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'Red dot.png', { type: 'image/png' }));
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, DOT_PNG);
  const images = body.locator('.ln-image img');
  await expect(images).toHaveCount(1);
  await expect.poll(() => images.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await body.evaluate((element, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'Second.png', { type: 'image/png' }));
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        clientX: box.left + 4,
        clientY: box.top + 4,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, DOT_PNG);
  await expect(images).toHaveCount(2);

  await page.getByRole('radio', { name: 'Markdown' }).click();
  const source = page.getByLabel('Markdown source');
  await expect(source).toContainText('![](attachments/Red-dot.png)');
  await expect(source).toContainText('![](attachments/Second.png)');
});
