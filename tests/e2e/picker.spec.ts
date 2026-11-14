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
    __escapeCount: number;
  }
}

type ChromeApi = {
  chrome: {
    tabs: {
      query(q: { url?: string }): Promise<{ id?: number }[]>;
      sendMessage(tabId: number, message: unknown): Promise<unknown>;
    };
    storage: {
      sync: { get(k: string): Promise<Record<string, unknown>> };
      local: { get(k: string): Promise<Record<string, unknown>> };
    };
  };
};

const E2E_NAME = 'E2E — harness de NFS-e';
const MODAL_TITLE = 'Emitir Nota Fiscal de Serviços Eletrônica';
const BANNER = 'Clique no campo que deseja preencher automaticamente';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

/** Abre uma página da extensão (para enviar mensagens à aba) e o harness com o modal aberto. */
async function setup(
  context: BrowserContext,
  extensionId: string,
): Promise<{ page: Page; ext: Page; tabId: number }> {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html?tabId=0`);
  await expect
    .poll(() =>
      ext.evaluate(
        async () =>
          'rule:e2e-harness' in
          (await (globalThis as unknown as ChromeApi).chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const tabId = await ext.evaluate(async (u) => {
    const tabs = await (globalThis as unknown as ChromeApi).chrome.tabs.query({ url: u });
    return tabs[0]?.id ?? -1;
  }, `${baseURL}/*`);
  expect(tabId).toBeGreaterThan(-1);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
  // espera o preenchimento automático terminar para não competir com a captura
  await expect.poll(() => page.evaluate(() => window.__harness.getState().nbs)).toBe('126029000');
  return { page, ext, tabId };
}

const startPicker = (ext: Page, tabId: number) =>
  ext.evaluate(
    (id) =>
      (globalThis as unknown as ChromeApi).chrome.tabs.sendMessage(id, { type: 'picker/start' }),
    tabId,
  );

const field = (page: Page, label: string) =>
  page.locator(`.eui-field:has(label.eui-label:text-is("${label}"))`);
const banner = (page: Page) => page.getByText(BANNER);
const escapeCount = (page: Page) => page.evaluate(() => window.__escapeCount);

async function expectPickerGone(page: Page): Promise<void> {
  await expect(page.locator('[data-assistente-captura]')).toHaveCount(0);
}

/** Inicia a captura, clica no campo e devolve a página de opções que o background abre. */
async function captureAndOpenOptions(
  context: BrowserContext,
  page: Page,
  ext: Page,
  tabId: number,
  target: ReturnType<Page['locator']>,
): Promise<Page> {
  await startPicker(ext, tabId);
  await expect(banner(page)).toBeVisible();
  const opened = context.waitForEvent('page');
  await target.click();
  const options = await opened;
  await options.waitForLoadState();
  return options;
}

test('captura "Descrição": o site não recebe o clique e as opções abrem com a escolha', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await setup(context, extensionId);
  await startPicker(ext, tabId);
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();

  const input = field(page, 'Descrição').locator('input');
  await input.hover();
  const host = page.locator('[data-assistente-captura]');
  await expect(host.locator('.tag')).toHaveText('Descrição · Texto');
  await expect(host.locator('.box')).toBeVisible();
  // destaque sem alterar o site: nenhum estilo inline na raiz
  await expect(field(page, 'Descrição')).not.toHaveAttribute('style', /./);

  const opened = context.waitForEvent('page');
  await input.click();
  const options = await opened;

  // o harness não viu o clique
  await expect(input).not.toBeFocused();
  expect(await page.evaluate(() => window.__harness.getState().descricao)).toBe('');
  expect(await escapeCount(page)).toBe(0);
  await expectPickerGone(page);

  // existe a regra e2e com o mesmo container: aparece a escolha
  const choice = options.getByTestId('capture-choice');
  await expect(choice).toBeVisible();
  await expect(choice.getByTestId('capture-add-to-rule')).toHaveText(
    `Adicionar à regra “${E2E_NAME}”`,
  );
  // consumo único: a chave foi apagada
  expect(
    await options.evaluate(
      async () =>
        await (globalThis as unknown as ChromeApi).chrome.storage.local.get('picker:draft'),
    ),
  ).toEqual({});

  // "Criar nova regra": editor pré-preenchido
  await choice.getByTestId('capture-new-rule').click();
  await expect(options.getByRole('heading', { name: 'Nova regra' })).toBeVisible();
  await expect(options.locator('#rule-name')).toHaveValue(MODAL_TITLE);
  await expect(options.locator('#url-0')).toHaveValue('http://127.0.0.1/*');
  await expect(options.locator('#container-selector')).toHaveValue('.eui-modal-wrapper.is-active');
  await expect(options.locator('#container-text')).toHaveValue(MODAL_TITLE);
  const card = options.locator('[data-field-id]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.f-by')).toHaveValue('label');
  await expect(card.locator('.f-locator')).toHaveValue('Descrição');
  await expect(card.locator('.f-type')).toHaveValue('native-text');
  await expect(card.locator('.f-type option:checked')).toHaveText('Texto');
  await expect(card.locator('.f-value')).toHaveValue('');
  await expect(card.locator('.f-value')).toBeFocused();
  await expect(card.getByTestId('value-hint')).toHaveText('valor atual na página: (vazio)');
});

test('"Adicionar à regra" acrescenta o campo; capturar de novo avisa e foca o existente', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await setup(context, extensionId);
  const options = await captureAndOpenOptions(
    context,
    page,
    ext,
    tabId,
    field(page, 'Descrição').locator('input'),
  );
  await options.getByTestId('capture-add-to-rule').click();
  await expect(options.getByRole('heading', { name: 'Editar regra' })).toBeVisible();
  const cards = options.locator('[data-field-id]');
  await expect(cards).toHaveCount(4); // nbs, consumo-pessoal, interno + o novo
  const added = cards.nth(3);
  await expect(added.locator('.f-locator')).toHaveValue('Descrição');
  await expect(added.locator('.f-value')).toBeFocused();
  await expect(added.getByTestId('value-hint')).toContainText('valor atual na página');

  await added.locator('.f-value').fill('texto fixo');
  await options.getByTestId('save-rule').click();
  await expect(options.getByTestId('notice')).toContainText('Regra salva');

  // Com a página de opções já aberta, a nova captura chega por storage.onChanged.
  await page.bringToFront();
  await startPicker(ext, tabId);
  await expect(banner(page)).toBeVisible();
  const pagesBefore = context.pages().length;
  await field(page, 'Descrição').locator('input').click();
  await expect(options.getByTestId('capture-choice')).toBeVisible();
  expect(context.pages().length).toBe(pagesBefore); // abriu/focou, sem duplicar a página
  await options.getByTestId('capture-add-to-rule').click();
  await expect(options.getByTestId('capture-duplicate')).toBeVisible();
  await expect(options.locator('[data-field-id]')).toHaveCount(4);
  await expect(options.locator('[data-field-id]').nth(3).locator('.f-value')).toBeFocused();
});

test('clique num elemento interno do multiselect captura a raiz sem abrir a lista', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await setup(context, extensionId);
  await startPicker(ext, tabId);
  const consumo = field(page, 'Tipo de operação governamental');
  const placeholder = consumo.locator('.multiselect__placeholder, .multiselect__single');
  await placeholder.hover();
  await expect(page.locator('[data-assistente-captura] .tag')).toHaveText(
    'Tipo de operação governamental · Lista com busca',
  );
  const opened = context.waitForEvent('page');
  await placeholder.click();
  const options = await opened;
  await expect(consumo.locator('.multiselect')).not.toHaveClass(/multiselect--active/);
  await expect(options.getByTestId('capture-choice')).toBeVisible();
  await options.getByTestId('capture-add-to-rule').click();
  const added = options.locator('[data-field-id]').nth(3);
  await expect(added.locator('.f-locator')).toHaveValue('Tipo de operação governamental');
  await expect(added.locator('.f-type')).toHaveValue('vue-multiselect');
});

test('Escape REAL durante a captura cancela e o site não vê a tecla', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await setup(context, extensionId);
  await page.bringToFront();
  await startPicker(ext, tabId);
  await expect(banner(page)).toBeVisible();
  const pagesBefore = context.pages().length;

  await page.keyboard.press('Escape');
  await expectPickerGone(page);
  expect(await escapeCount(page)).toBe(0);
  await expect(page.locator('.eui-confirm-wrapper')).toHaveCount(0);
  expect(context.pages().length).toBe(pagesBefore);

  // Fora do modo captura o Escape volta a chegar ao site (o harness imita o diálogo da CE).
  await page.keyboard.press('Escape');
  await expect.poll(() => escapeCount(page)).toBeGreaterThan(0);
  await expect(page.locator('.eui-confirm-wrapper')).toBeVisible();
});

test('Cancelar encerra sem capturar; clique fora de campo só avisa', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await setup(context, extensionId);
  await startPicker(ext, tabId);
  await expect(banner(page)).toBeVisible();

  await page.locator('#outros-campos h3').click();
  await expect(page.locator('[data-assistente-captura] .note')).toContainText(
    'não parece ser um campo',
  );
  await expect(banner(page)).toBeVisible();

  const pagesBefore = context.pages().length;
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expectPickerGone(page);
  expect(context.pages().length).toBe(pagesBefore);
  expect(await escapeCount(page)).toBe(0);

  // depois de sair, o site volta a receber os cliques
  const input = field(page, 'Descrição').locator('input');
  await input.click();
  await expect(input).toBeFocused();
});

test('popup: botão "Capturar campo" liga o modo captura na aba', async ({
  context,
  extensionId,
}) => {
  const { page, ext, tabId } = await setup(context, extensionId);
  await ext.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  const button = ext.getByRole('button', { name: 'Capturar campo' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(banner(page)).toBeVisible();
});
