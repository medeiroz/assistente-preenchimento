import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
declare const chrome: { storage: { sync: ChromeArea } };
type HarnessWindow = Window & { __escapeCount: number; __docKeys: number; __emitted: boolean };

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const CPF = { by: 'label', text: 'CPF do tomador' };
const NOME = { by: 'label', text: 'Nome do tomador' };

async function setFields(ext: Page, fields: unknown[]) {
  await ext.evaluate(async (fs) => {
    const got = await chrome.storage.sync.get('rule:e2e-harness');
    const rule = got['rule:e2e-harness'] as { fields: unknown[] };
    rule.fields = fs;
    await chrome.storage.sync.set({ 'rule:e2e-harness': rule });
  }, fields);
}

async function prepare(
  context: import('@playwright/test').BrowserContext,
  extensionId: string,
  fields: unknown[],
) {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);
  await expect
    .poll(() =>
      ext.evaluate(
        async () => 'rule:e2e-harness' in (await chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
  await setFields(ext, fields);
  await ext.close();
}

async function openModal(page: Page) {
  await page.goto(`${baseURL}/`);
  await page.waitForTimeout(500); // o content script recebe a regra nova
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__escapeCount)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__emitted)).toBe(false);
});

test('digitação simulada aciona máscara e busca; o campo seguinte espera e é preenchido', async ({
  context,
  extensionId,
  page,
}) => {
  await prepare(context, extensionId, [
    {
      id: 'cpf',
      enabled: true,
      locator: CPF,
      adapter: 'native-text',
      value: '12345678909',
      typing: { keyDelayMs: 15 },
    },
    {
      id: 'nome',
      enabled: true,
      locator: NOME,
      adapter: 'native-text',
      value: 'Ana Exemplo',
      delayMs: 600,
    },
  ]);
  await openModal(page);
  // Ainda digitando/esperando: o nome não pode estar preenchido logo no início.
  await expect(page.locator('#doc-nome')).toHaveValue('');
  await expect(page.locator('#doc-cpf')).toHaveValue('123.456.789-09', { timeout: 3000 });
  await expect(page.locator('#doc-nome')).toHaveValue('Ana Exemplo', { timeout: 4000 });
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__docKeys)).toBe(11);
});

test('sem digitação simulada a busca não dispara e o campo seguinte falha', async ({
  context,
  extensionId,
  page,
}) => {
  await prepare(context, extensionId, [
    { id: 'cpf', enabled: true, locator: CPF, adapter: 'native-text', value: '12345678909' },
    { id: 'nome', enabled: true, locator: NOME, adapter: 'native-text', value: 'Ana Exemplo' },
  ]);
  await openModal(page);
  await expect(page.locator('#doc-cpf')).toHaveValue('123.456.789-09', { timeout: 3000 });
  await page.waitForTimeout(800);
  await expect(page.locator('#doc-nome')).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__docKeys)).toBe(0);
});
