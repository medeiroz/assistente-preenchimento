import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
declare const chrome: { storage: { sync: ChromeArea } };
type HarnessWindow = Window & {
  __harness: { getState(): Record<string, unknown>; close(): void };
  __emitted: boolean;
  __escapeCount: number;
  __cancelled: boolean;
};

const TOAST = '[data-assistente-preenchimento]';
const BUTTON_HOST = '[data-assistente-acao]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

async function setMode(ext: Page, mode: 'auto' | 'button') {
  await ext.evaluate(async (m) => {
    const got = await chrome.storage.sync.get('rule:e2e-harness');
    const rule = got['rule:e2e-harness'] as { behavior: { mode: string } };
    rule.behavior.mode = m;
    await chrome.storage.sync.set({ 'rule:e2e-harness': rule });
  }, mode);
}

const state = (page: Page) => page.evaluate(() => (window as HarnessWindow).__harness.getState());

test('modo botão: não preenche ao abrir; clique preenche; Desfazer restaura', async ({
  context,
  extensionId,
  page,
}) => {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);
  await expect
    .poll(() =>
      ext.evaluate(
        async () => 'rule:e2e-harness' in (await chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
  await setMode(ext, 'button');

  try {
    await page.goto(`${baseURL}/`);
    // Dá tempo ao content script de receber a mudança de regra.
    await page.waitForTimeout(500);
    await page.click('#open-nfse');
    await expect(page.locator('.eui-modal-title')).toBeVisible();

    const button = page.locator(`${BUTTON_HOST} >> button`);
    await expect(button).toBeVisible();
    await expect(button).toContainText('Preencher:');
    await page.waitForTimeout(1500);
    let s = await state(page);
    expect(s.nbs).toBe('');
    expect(s.consumo).toBeNull();
    await expect(page.locator(TOAST)).toHaveCount(0);

    await button.click();
    await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('126029000');
    await expect
      .poll(async () => ((await state(page)).consumo as { id: number } | null)?.id, {
        timeout: 3000,
      })
      .toBe(0);
    await expect(page.locator(`${BUTTON_HOST} >> button`)).toHaveCount(0);
    await expect(page.locator(`${TOAST} .summary`)).toContainText(/[23] preenchidos/);

    await page.locator(`${TOAST} .undo`).click();
    await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('');
    await expect(page.locator(`${TOAST} .summary`)).toContainText(/[23] campos restaurados/);
    await expect(page.locator(`${TOAST} .undo`)).toHaveCount(0);
    await expect(page.locator(`${TOAST} li.error`)).toHaveCount(0);
    // O multiselect sem valor anterior agora é limpo (botão ×): consumo volta a null.
    await expect.poll(async () => (await state(page)).consumo, { timeout: 3000 }).toBeNull();
    s = await state(page);
    expect(s.nbs).toBe('');

    expect(await page.evaluate(() => (window as HarnessWindow).__escapeCount)).toBe(0);
    expect(await page.evaluate(() => (window as HarnessWindow).__cancelled)).toBe(false);
    expect(await page.evaluate(() => (window as HarnessWindow).__emitted)).toBe(false);
  } finally {
    await setMode(ext, 'auto');
    await ext.close();
  }
});
