import { test, expect, type Page } from '@playwright/test';
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

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const state = (page: Page) => page.evaluate(() => window.__harness.getState());
const field = (page: Page, label: string) =>
  page.locator(`.eui-field:has(label.eui-label:text-is("${label}"))`);

async function openModal(page: Page, query = '') {
  await page.goto(`${baseURL}/${query}`);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
}

test('abre o modal com título e 5 campos rotulados', async ({ page }) => {
  await openModal(page);
  await expect(page.locator('.eui-modal-title')).toHaveText(
    'Emitir Nota Fiscal de Serviços Eletrônica',
  );
  await expect(page.locator('.eui-modal-body > .eui-field')).toHaveCount(5);
  await expect(page.locator('.eui-modal-body > .eui-field > label.eui-label')).toHaveCount(5);
});

test('digitar no Código NBS atualiza o modelo', async ({ page }) => {
  await openModal(page);
  await page.fill('.eui-field:has(label:text-is("Código NBS")) input', '123456789');
  expect((await state(page)).nbs).toBe('123456789');
});

test('selecionar "Não" no multiselect com cliques reais', async ({ page }) => {
  await openModal(page);
  const f = field(page, 'Operação de uso ou consumo pessoal');
  await f.locator('.multiselect').click();
  await f.locator('.multiselect__option', { hasText: 'Não' }).click();
  expect(((await state(page)).consumo as { id: number }).id).toBe(0);
  await expect(f.locator('.multiselect__single')).toHaveText('Não');
});

test('preset carregado mostra os valores', async ({ page }) => {
  await openModal(page, '?preset=loaded');
  await expect(field(page, 'Código NBS').locator('input')).toHaveValue('999999999');
  await expect(
    field(page, 'Operação de uso ou consumo pessoal').locator('.multiselect__single'),
  ).toHaveText('Sim');
  expect(await state(page)).toMatchObject({ nbs: '999999999', consumo: { id: 1, name: 'Sim' } });
});

test('fechar por v-if remove o wrapper', async ({ page }) => {
  await openModal(page);
  await page.click('.eui-modal-close');
  await expect(page.locator('.eui-modal-wrapper')).toHaveCount(0);
});

test('fechar por classe mantém o wrapper sem is-active', async ({ page }) => {
  await openModal(page, '?close=class');
  await page.click('.eui-modal-close');
  await expect(page.locator('.eui-modal-wrapper')).toHaveCount(1);
  await expect(page.locator('.eui-modal-wrapper')).not.toHaveClass(/is-active/);
  await expect(page.locator('.eui-modal-title')).toBeHidden();
});

test('seção "Mais campos" aparece após ~800ms', async ({ page }) => {
  await openModal(page);
  await expect(page.getByText('Código interno do contribuinte')).toHaveCount(0);
  await expect(page.getByText('Código interno do contribuinte')).toBeVisible({ timeout: 3000 });
});

test('Emitir NFS-e só seta window.__emitted', async ({ page }) => {
  await openModal(page);
  const before = await state(page);
  expect(await page.evaluate(() => window.__emitted)).toBe(false);
  await page.click('text=Emitir NFS-e');
  expect(await page.evaluate(() => window.__emitted)).toBe(true);
  expect(await state(page)).toEqual(before);
  await expect(page.locator('.eui-modal-wrapper.is-active')).toHaveCount(1);
});

test('sanidade: Escape real com o modal aberto abre o diálogo de cancelamento', async ({
  page,
}) => {
  await openModal(page);
  expect(await page.evaluate(() => window.__escapeCount)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Deseja cancelar a emissão da nota?')).toBeVisible();
  expect(await page.evaluate(() => window.__escapeCount)).toBeGreaterThan(0);
  await page.click('.eui-confirm-back');
  await expect(page.locator('.eui-confirm-wrapper')).toHaveCount(0);
  await expect(page.locator('.eui-modal-title')).toBeVisible();
  expect(await page.evaluate(() => window.__cancelled)).toBe(false);
});

test('"Sim, cancelar" fecha o modal e seta __cancelled', async ({ page }) => {
  await openModal(page);
  await page.keyboard.press('Escape');
  await page.click('.eui-confirm-cancel');
  await expect(page.locator('.eui-modal-wrapper')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cancelled)).toBe(true);
});
