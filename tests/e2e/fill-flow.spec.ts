import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { start, stop } from './harness-server';

declare global {
  interface Window {
    __harness: {
      getState(): Record<string, unknown>;
      open(preset?: unknown): void;
      close(): void;
      hideViaClass(): void;
    };
    __emitted: boolean;
    __escapeCount: number;
    __cancelled: boolean;
  }
}

const NBS = 'Código NBS';
const INTERNO = 'Código interno do contribuinte';
const TOAST = '[data-assistente-preenchimento]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

// As regras vêm do storage (semeado pelo background): espera o seed antes de abrir o harness.
test.beforeEach(async ({ context, extensionId }) => {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);
  await expect
    .poll(() =>
      ext.evaluate(async () => {
        const c = (
          globalThis as unknown as {
            chrome: { storage: { sync: { get(k: string): Promise<Record<string, unknown>> } } };
          }
        ).chrome;
        return 'rule:e2e-harness' in (await c.storage.sync.get('rule:e2e-harness'));
      }),
    )
    .toBe(true);
  await ext.close();
});

const state = (page: Page) => page.evaluate(() => window.__harness.getState());
const field = (page: Page, label: string) =>
  page.locator(`.eui-field:has(label.eui-label:text-is("${label}"))`);
const emitted = (page: Page) => page.evaluate(() => window.__emitted);

const errors = new WeakMap<Page, string[]>();

async function openModal(page: Page, query = '') {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
  await page.goto(`${baseURL}/${query}`);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
}

async function expectFilled(page: Page) {
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('126029000');
  await expect
    .poll(async () => ((await state(page)).consumo as { id: number } | null)?.id, {
      timeout: 3000,
    })
    .toBe(0);
}

test.afterEach(async ({ page }) => {
  expect(await emitted(page)).toBe(false);
  expect(await page.evaluate(() => window.__escapeCount)).toBe(0);
  expect(await page.evaluate(() => window.__cancelled)).toBe(false);
  await expect(page.locator('.eui-confirm-wrapper')).toHaveCount(0);
  const own = (errors.get(page) ?? []).filter((e) =>
    /assistente|extension|chrome-extension/i.test(e),
  );
  expect(own).toEqual([]);
});

test('abre o modal, preenche NBS e consumo e mostra o toast', async ({ page }) => {
  await openModal(page);
  await expectFilled(page);
  const summary = page.locator(`${TOAST} .summary`);
  await expect(summary).toContainText(/[23] preenchidos/);
  await expect(page.locator(`${TOAST} .title`)).toContainText('Assistente ·');
  await expect(field(page, NBS).locator('input')).toHaveValue('126029000');
  await expect(
    field(page, 'Operação de uso ou consumo pessoal').locator('.multiselect__single'),
  ).toHaveText('Não');
});

test('campo tardio recebe "sem-ref" e o toast passa a 3 preenchidos', async ({ page }) => {
  await openModal(page);
  await expect(field(page, INTERNO).locator('input')).toHaveValue('sem-ref', { timeout: 4000 });
  expect((await state(page)).interno).toBe('sem-ref');
  await expect(page.locator(`${TOAST} .summary`)).toContainText('3 preenchidos');
});

test('campo tardio usa expressão com ?ref=ABC', async ({ page }) => {
  await openModal(page, '?ref=ABC');
  await expect(field(page, INTERNO).locator('input')).toHaveValue('ABC', { timeout: 4000 });
  expect((await state(page)).interno).toBe('ABC');
});

test('preset carregado: valores intactos', async ({ page }) => {
  await openModal(page, '?preset=loaded');
  await expect(field(page, INTERNO).locator('input')).toHaveValue('sem-ref', { timeout: 4000 });
  await page.waitForTimeout(500);
  const s = await state(page);
  expect(s.nbs).toBe('999999999');
  expect((s.consumo as { id: number }).id).toBe(1);
  await expect(page.locator(TOAST)).toHaveCount(1);
  await expect(page.locator(`${TOAST} .summary`)).toContainText('1 preenchidos');
});

test('limpar o NBS manualmente não re-preenche', async ({ page }) => {
  await openModal(page);
  await expectFilled(page);
  await page.fill('.eui-field:has(label:text-is("Código NBS")) input', '');
  await page.waitForTimeout(2000);
  expect((await state(page)).nbs).toBe('');
});

test('fechar (v-if) e reabrir preenche de novo', async ({ page }) => {
  await openModal(page);
  await expectFilled(page);
  await page.evaluate(() => window.__harness.close());
  await expect(page.locator('.eui-modal-title')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
  await expectFilled(page);
});

test('?close=class: fechar por classe e reabrir preenche de novo', async ({ page }) => {
  await openModal(page, '?close=class');
  await expectFilled(page);
  await page.evaluate(() => window.__harness.close());
  await page.waitForTimeout(500);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
  await expectFilled(page);
});
