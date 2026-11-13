import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

declare global {
  interface Window {
    __harness: {
      getState(): Record<string, unknown>;
      open(preset?: unknown): void;
      close(): void;
      hideViaClass(): void;
    };
  }
}

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

type ChromeTabs = {
  chrome: {
    tabs: { query(q: { url?: string }): Promise<{ id?: number }[]> };
    storage: { sync: { get(k: string): Promise<Record<string, unknown>> } };
  };
};

async function waitSeed(ext: Page): Promise<void> {
  await expect
    .poll(() =>
      ext.evaluate(
        async () =>
          'rule:e2e-harness' in
          (await (globalThis as unknown as ChromeTabs).chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
}

/** Abre o harness e devolve o tabId (obtido por uma página da extensão; build e2e tem "tabs"). */
async function openHarness(
  context: BrowserContext,
  extensionId: string,
): Promise<{ page: Page; ext: Page; tabId: number }> {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);
  await waitSeed(ext);
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const tabId = await ext.evaluate(async (u) => {
    const tabs = await (globalThis as unknown as ChromeTabs).chrome.tabs.query({ url: u });
    return tabs[0]?.id ?? -1;
  }, `${baseURL}/*`);
  expect(tabId).toBeGreaterThan(-1);
  return { page, ext, tabId };
}

const state = (page: Page) => page.evaluate(() => window.__harness.getState());
const openModal = async (page: Page) => {
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
};
const popupUrl = (extensionId: string, tabId: number) =>
  `chrome-extension://${extensionId}/popup.html?tabId=${tabId}`;

test('lista a regra, mostra o relatório, preenche agora e desfaz', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await openHarness(context, extensionId);
  await openModal(page);
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('126029000');
  // O toast só aparece depois que o relatório existe no controlador.
  await expect(page.locator('[data-assistente-preenchimento] .summary')).toContainText(
    'preenchidos',
  );

  await ext.goto(popupUrl(extensionId, tabId));
  await expect(ext.getByRole('heading', { name: 'Assistente de Preenchimento' })).toBeVisible();
  await expect(ext.getByTestId('rules')).toContainText('E2E — harness de NFS-e');
  await expect(ext.getByTestId('rules')).toContainText('Automático');
  const fields = ext.getByTestId('report-fields');
  await expect(fields).toContainText('Preenchido');
  await expect(fields.locator('[data-outcome="filled"]').first()).toBeVisible();
  await expect(ext.getByTestId('report-summary')).toContainText('preenchidos');

  // Usuário esvazia o NBS: "Preencher agora" expressa intenção de preencher, então preenche de novo.
  await page.fill('.eui-field:has(label:text-is("Código NBS")) input', '');
  await expect.poll(async () => (await state(page)).nbs).toBe('');
  await ext.getByRole('button', { name: 'Preencher agora' }).click();
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('126029000');
  await expect(ext.getByTestId('report-fields')).toContainText('Preenchido');
  await expect(ext.getByTestId('report-summary')).toContainText(/\d+ preenchidos/);

  // Desfazer restaura/limpa; o relatório vira 'Desfeito' e o botão Desfazer fica desabilitado.
  await ext.getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('');
  await expect.poll(async () => (await state(page)).consumo, { timeout: 3000 }).toBeNull();
  await expect(ext.getByTestId('report-fields')).toContainText('Desfeito');
  await expect(ext.getByRole('button', { name: 'Desfazer' })).toBeDisabled();

  // Preencher agora de novo preenche e reabilita o Desfazer.
  await ext.getByRole('button', { name: 'Preencher agora' }).click();
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('126029000');
  await expect(ext.getByRole('button', { name: 'Desfazer' })).toBeEnabled();
  await ext.getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('');
});

test('pausar impede o preenchimento; despausar volta a preencher', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await openHarness(context, extensionId);
  await ext.goto(popupUrl(extensionId, tabId));
  const toggle = ext.getByRole('switch', { name: 'Ativo neste site' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(ext.getByText('Pausado neste site')).toBeVisible();
  await expect(ext.getByRole('button', { name: 'Preencher agora' })).toBeDisabled();
  await page.waitForTimeout(500); // onChange do storage chega ao content script

  await openModal(page);
  await page.waitForTimeout(1500);
  expect((await state(page)).nbs).toBe('');

  await page.evaluate(() => window.__harness.close());
  await expect(page.locator('.eui-modal-title')).toHaveCount(0);
  await toggle.check();
  await expect(ext.getByText('Pausado neste site')).toHaveCount(0);
  await page.waitForTimeout(500);
  await openModal(page);
  await expect.poll(async () => (await state(page)).nbs, { timeout: 3000 }).toBe('126029000');
});

test('aba sem content script: "A extensão não atua nesta página"', async ({
  context,
  extensionId,
}) => {
  const { ext } = await openHarness(context, extensionId);
  const blank = await context.newPage();
  await blank.goto('about:blank');
  const blankId = await ext.evaluate(async () => {
    const tabs = await (globalThis as unknown as ChromeTabs).chrome.tabs.query({
      url: 'about:blank',
    });
    return tabs[0]?.id ?? -1;
  });
  expect(blankId).toBeGreaterThan(-1);
  await ext.goto(popupUrl(extensionId, blankId));
  await expect(ext.getByText('A extensão não atua nesta página')).toBeVisible({ timeout: 4000 });
  await expect(ext.getByRole('button', { name: 'Abrir configurações' })).toBeVisible();
});
