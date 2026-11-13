import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
declare const chrome: { storage: { sync: ChromeArea; local: ChromeArea } };
type HarnessWindow = Window & {
  __harness: { getState(): Record<string, unknown>; close(): void };
};

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

type Area = 'sync' | 'local';

async function openExtPage(context: import('@playwright/test').BrowserContext, id: string) {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${id}/options.html`);
  return ext;
}

const read = (ext: Page, area: Area) =>
  ext.evaluate((a) => chrome.storage[a].get(null) as Promise<Record<string, unknown>>, area);

async function waitSeed(ext: Page) {
  await expect.poll(async () => 'rule:e2e-harness' in (await read(ext, 'sync'))).toBe(true);
}

async function setHarnessNbs(ext: Page, value: string) {
  await ext.evaluate(async (v) => {
    const got = await chrome.storage.sync.get('rule:e2e-harness');
    const rule = got['rule:e2e-harness'] as { fields: { id: string; value: string }[] };
    const f = rule.fields.find((x) => x.id === 'nbs');
    if (f) f.value = v;
    await chrome.storage.sync.set({ 'rule:e2e-harness': rule });
  }, value);
}

async function setPaused(ext: Page, hosts: string[]) {
  await ext.evaluate(async (h) => {
    await chrome.storage.sync.set({ 'cfg:settings': { pausedHosts: h } });
  }, hosts);
}

const nbs = (page: Page) => page.evaluate(() => (window as HarnessWindow).__harness.getState().nbs);

async function openModal(page: Page) {
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
}

async function reopenModal(page: Page) {
  await page.evaluate(() => (window as HarnessWindow).__harness.close());
  await expect(page.locator('.eui-modal-title')).toHaveCount(0);
  await page.waitForTimeout(300);
  await openModal(page);
}

test('instala com o preset no storage e o fluxo de preenchimento funciona', async ({
  context,
  extensionId,
  page,
}) => {
  const ext = await openExtPage(context, extensionId);
  await waitSeed(ext);
  const all = await read(ext, 'sync');
  expect(all['cfg:meta']).toMatchObject({ schemaVersion: 1 });
  expect((all['cfg:meta'] as { ruleIds: string[] }).ruleIds).toContain('e2e-harness');
  expect(all['rule:ce-nfse-basico']).toBeTruthy();

  await page.goto(`${baseURL}/`);
  await openModal(page);
  await expect.poll(() => nbs(page), { timeout: 4000 }).toBe('126029000');
});

test('alterar a regra no storage vale sem recarregar a página', async ({
  context,
  extensionId,
  page,
}) => {
  const ext = await openExtPage(context, extensionId);
  await waitSeed(ext);
  await page.goto(`${baseURL}/`);
  await openModal(page);
  await expect.poll(() => nbs(page), { timeout: 4000 }).toBe('126029000');

  await setHarnessNbs(ext, '111111111');
  await page.waitForTimeout(500);
  await reopenModal(page);
  await expect.poll(() => nbs(page), { timeout: 4000 }).toBe('111111111');
});

test('host pausado não preenche; despausar volta a preencher', async ({
  context,
  extensionId,
  page,
}) => {
  const ext = await openExtPage(context, extensionId);
  await waitSeed(ext);
  await page.goto(`${baseURL}/`);
  await openModal(page);
  await expect.poll(() => nbs(page), { timeout: 4000 }).toBe('126029000');

  const host = new URL(baseURL).hostname;
  await setPaused(ext, [host]);
  await page.waitForTimeout(500);
  await reopenModal(page);
  await page.waitForTimeout(1500);
  expect(await nbs(page)).toBe('');

  await setPaused(ext, []);
  await page.waitForTimeout(500);
  await reopenModal(page);
  await expect.poll(() => nbs(page), { timeout: 4000 }).toBe('126029000');
});

test('histórico em storage.local recebe o relatório', async ({ context, extensionId, page }) => {
  const ext = await openExtPage(context, extensionId);
  await waitSeed(ext);
  await page.goto(`${baseURL}/`);
  await openModal(page);
  await expect.poll(() => nbs(page), { timeout: 4000 }).toBe('126029000');
  await expect
    .poll(async () => {
      const h = (await read(ext, 'local')).history;
      return Array.isArray(h) ? h.length : 0;
    })
    .toBeGreaterThan(0);
  const history = (await read(ext, 'local')).history as { ruleId: string }[];
  expect(history[0]?.ruleId).toBe('e2e-harness');
});
