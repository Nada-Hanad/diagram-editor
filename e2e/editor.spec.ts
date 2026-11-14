import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

const shape = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const shapes = (page: Page) => page.locator('[data-node-id]');
const edges = (page: Page) => page.locator('[data-edge-id]');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const field = (page: Page, label: string) => inspector(page).getByLabel(label, { exact: true });
const status = (page: Page) => page.getByRole('status');
const zoomLabel = (page: Page) => page.getByRole('button', { name: 'Reset zoom to 100%' });

async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(shapes(page)).toHaveCount(7);
});

test('opens with the example diagram fitted to the screen', async ({ page }) => {
  await expect(edges(page)).toHaveCount(5);
  for (const name of ['Ellipse: Order received', 'Decision: In stock?', 'Note: Back-orders older than 14 days are reviewed every Monday.']) {
    await expect(shape(page, name)).toBeInViewport();
  }
});

test('adds a shape from the toolbar and selects it', async ({ page }) => {
  await page.getByRole('button', { name: 'Add ellipse' }).click();
  await expect(shapes(page)).toHaveCount(8);
  await expect(inspector(page).getByRole('heading', { name: 'Ellipse' })).toBeVisible();
  await expect(status(page)).toHaveText('Added ellipse.');
});

test('dragging snaps to the grid and undoes in one step', async ({ page }) => {
  const box = shape(page, 'Rectangle: Pick and pack');
  await box.click();
  const x0 = Number(await field(page, 'X').inputValue());
  const zoom = Number((await zoomLabel(page).innerText()).replace('%', '')) / 100;

  const from = await centre(box);
  await drag(page, from, { x: from.x + 63 * zoom, y: from.y + 7 * zoom });
  await expect(field(page, 'X')).toHaveValue(String(x0 + 60));

  await page.keyboard.press('ControlOrMeta+z');
  await expect(field(page, 'X')).toHaveValue(String(x0));
});

test('a drag on empty canvas selects every shape it touches', async ({ page }) => {
  const a = await shape(page, 'Rectangle: Pick and pack').boundingBox();
  const b = await shape(page, 'Rectangle: Create back-order').boundingBox();
  await drag(page, { x: a!.x - 20, y: a!.y - 20 }, { x: b!.x + 40, y: b!.y + 30 });
  await expect(inspector(page).getByRole('heading', { name: '2 shapes' })).toBeVisible();

  await page.getByRole('button', { name: 'Align left edges' }).click();
  const after = await Promise.all([shape(page, 'Rectangle: Pick and pack'), shape(page, 'Rectangle: Create back-order')].map((s) => s.boundingBox()));
  expect(after[0]!.x).toBeCloseTo(after[1]!.x, 0);
});

test('dragging from a side dot onto another shape connects them', async ({ page }) => {
  const source = shape(page, 'Rectangle: Ship with tracking');
  await source.hover();
  const port = source.locator('[data-port]').nth(2);
  await drag(page, await centre(port), await centre(shape(page, 'Rectangle: Email expected date')));
  await expect(edges(page)).toHaveCount(6);
  await expect(status(page)).toHaveText('Connected Rectangle “Ship with tracking” to Rectangle “Email expected date”.');
});

test('connects with the keyboard only', async ({ page }) => {
  await shape(page, 'Rectangle: Ship with tracking').focus();
  await page.keyboard.press('c');
  await expect(status(page)).toContainText('Connecting from Rectangle “Ship with tracking”');
  await shape(page, 'Note: Back-orders older than 14 days are reviewed every Monday.').focus();
  await page.keyboard.press('Enter');
  await expect(edges(page)).toHaveCount(6);
});

test('double-click edits text in place', async ({ page }) => {
  await shape(page, 'Rectangle: Pick and pack').dblclick();
  const editor = page.getByRole('textbox', { name: 'Shape text' });
  await expect(editor).toBeFocused();
  await editor.fill('Pick, pack and weigh');
  await editor.press('Enter');
  await expect(shape(page, 'Rectangle: Pick, pack and weigh')).toBeVisible();
  await expect(shape(page, 'Rectangle: Pick, pack and weigh')).toBeFocused();
});

test('ctrl + wheel zooms around the pointer', async ({ page }) => {
  const target = shape(page, 'Decision: In stock?');
  const before = await centre(target);
  const zoomBefore = await zoomLabel(page).innerText();
  await page.mouse.move(before.x, before.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(zoomLabel(page)).not.toHaveText(zoomBefore);
  const after = await centre(target);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  const box = await target.boundingBox();
  expect(box!.width).toBeGreaterThan(150);
});

test('arrow keys nudge, Delete removes, undo restores', async ({ page }) => {
  await shape(page, 'Rectangle: Pick and pack').focus();
  const x0 = Number(await field(page, 'X').inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(field(page, 'X')).toHaveValue(String(x0 + 1));
  await page.keyboard.press('Shift+ArrowRight');
  await expect(field(page, 'X')).toHaveValue(String(x0 + 21));

  await page.keyboard.press('Delete');
  await expect(shapes(page)).toHaveCount(6);
  // Its two connectors go with it.
  await expect(edges(page)).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(shapes(page)).toHaveCount(7);
  await expect(edges(page)).toHaveCount(5);
});

test('exports JSON that imports back, and rejects a broken file', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export JSON' }).click()]);
  const path = testInfo.outputPath('diagram.json');
  await download.saveAs(path);
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.nodes).toHaveLength(7);

  const chooser = async (name: string, contents: string) => {
    await page.getByRole('button', { name: 'File' }).click();
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: 'Import JSON…' }).click()]);
    await fileChooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(contents) });
  };

  await chooser('broken.json', JSON.stringify({ version: 1, nodes: [{ id: 'a', x: 0, y: 0, w: 50, h: 50 }], edges: [{ id: 'e', from: 'a', to: 'missing' }] }));
  await expect(status(page)).toHaveText('Import failed. Connector 1 points to a shape that does not exist.');
  await expect(shapes(page)).toHaveCount(7);

  exported.nodes = exported.nodes.slice(0, 2);
  exported.edges = [];
  await chooser('small.json', JSON.stringify(exported));
  await expect(shapes(page)).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(shapes(page)).toHaveCount(7);
});

test('exports SVG and PNG files', async ({ page }, testInfo) => {
  for (const [label, check] of [
    ['Export SVG', (b: Buffer) => b.toString('utf8').startsWith('<svg')],
    ['Export PNG', (b: Buffer) => b.subarray(1, 4).toString('ascii') === 'PNG' && b.length > 5000],
  ] as const) {
    await page.getByRole('button', { name: 'File' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: label }).click()]);
    const path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    expect(check(await readFile(path)), label).toBe(true);
  }
});

test('the diagram survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(shapes(page)).toHaveCount(8);
  await page.reload();
  await expect(shapes(page)).toHaveCount(8);
});

test('the shortcuts dialog opens with ? and closes with Escape', async ({ page }) => {
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard and mouse' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('fits a phone screen without scrolling the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Add rectangle' })).toBeVisible();
  await expect(shape(page, 'Ellipse: Order received')).toBeInViewport();
});
