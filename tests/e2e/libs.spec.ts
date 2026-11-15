import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';
import { bundleAdapters } from './bundle';

interface ChromeApi {
  chrome: {
    storage: {
      sync: {
        get(k: string): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
      };
    };
  };
}
type LibsWindow = Window & {
  __libs: {
    reactChanges: (string | null)[];
    select2Changes: (string | null)[];
    editableInputs: string[];
    editableBeforeInputs: string[];
  };
  __adapters: { registry: { resolve(root: Element, ref: string): { id: string } | null } };
};

const TOAST = '[data-assistente-preenchimento]';
const NOTA = 'Observação clínica';
const TIPO = 'Tipo de atendimento';
const PAGAMENTO = 'Forma de pagamento';

let baseURL = '';
let bundle = '';
test.beforeAll(async () => {
  baseURL = await start();
  bundle = await bundleAdapters();
});
test.afterAll(async () => {
  await stop();
});

const field = (label: string) => ({
  id: label,
  enabled: true,
  locator: { by: 'label', text: label },
  adapter: 'auto',
});

/** Troca os campos da regra e2e (semeada pelo background) pelos do teste. */
async function prepare(context: BrowserContext, extensionId: string, values: [string, string][]) {
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
  await ext.evaluate(
    async (fields) => {
      const { chrome } = globalThis as unknown as ChromeApi;
      const got = await chrome.storage.sync.get('rule:e2e-harness');
      const rule = got['rule:e2e-harness'] as {
        fields: unknown[];
        behavior: { overwrite: string };
      };
      rule.fields = fields;
      rule.behavior.overwrite = 'always';
      await chrome.storage.sync.set({ 'rule:e2e-harness': rule });
    },
    values.map(([label, value]) => ({ ...field(label), value })),
  );
  await ext.close();
}

async function open(context: BrowserContext, query = ''): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto(`${baseURL}/libs.html${query}`);
  await expect(page.locator('.select2-container')).toBeVisible();
  await expect(page.locator('#tipo-atendimento')).toBeAttached();
  return page;
}

const nota = (page: Page) => page.locator('#nota');
const reactValue = (page: Page) => page.locator('[class*="singleValue"]');
const select2Rendered = (page: Page) => page.locator('.select2-selection__rendered');
const selectValue = (page: Page) => page.locator('#pagamento').inputValue();
const logs = (page: Page) => page.evaluate(() => (window as unknown as LibsWindow).__libs);

test('preenche contenteditable, React-Select e Select2 e o Desfazer limpa tudo', async ({
  context,
  extensionId,
}) => {
  await prepare(context, extensionId, [
    [NOTA, 'Paciente estável'],
    [TIPO, 'Exame'],
    [PAGAMENTO, 'Boleto'],
  ]);
  const page = await open(context);

  await expect(nota(page)).toHaveText('Paciente estável', { timeout: 4000 });
  await expect(reactValue(page)).toHaveText('Exame', { timeout: 4000 });
  await expect(select2Rendered(page)).toHaveText('Boleto', { timeout: 4000 });
  expect(await selectValue(page)).toBe('boleto');

  const log = await logs(page);
  expect(log.reactChanges).toEqual(['Exame']);
  expect(log.select2Changes).toEqual(['boleto']);
  expect(log.editableBeforeInputs).toContain('insertText');
  expect(log.editableInputs).toContain('insertText');
  await expect(page.locator(`${TOAST} .summary`)).toContainText('3 preenchidos');
  // os menus fecharam sozinhos
  await expect(page.locator('[id^="react-select-"][id$="-listbox"]')).toHaveCount(0);
  await expect(page.locator('.select2-container--open')).toHaveCount(0);

  await page.locator(`${TOAST} .undo`).click();
  await expect(nota(page)).toHaveText('', { timeout: 4000 });
  await expect(reactValue(page)).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('.select2-selection__placeholder')).toBeVisible();
  expect(await selectValue(page)).toBe('');
  const after = await logs(page);
  expect(after.reactChanges).toEqual(['Exame', null]);
  expect(after.select2Changes).toEqual(['boleto', '']);
  await expect(page.locator(`${TOAST} li.error`)).toHaveCount(0);
});

test('Desfazer devolve o valor anterior de cada biblioteca', async ({ context, extensionId }) => {
  await prepare(context, extensionId, [
    [NOTA, 'Texto novo'],
    [TIPO, 'Exame'],
    [PAGAMENTO, 'Pix'],
  ]);
  const page = await open(context, '?initial=1');
  await expect(nota(page)).toHaveText('Texto novo', { timeout: 4000 });
  await expect(reactValue(page)).toHaveText('Exame', { timeout: 4000 });
  await expect(select2Rendered(page)).toHaveText('Pix', { timeout: 4000 });

  await page.locator(`${TOAST} .undo`).click();
  await expect(nota(page)).toHaveText('Texto anterior', { timeout: 4000 });
  await expect(reactValue(page)).toHaveText('Retorno', { timeout: 4000 });
  await expect(select2Rendered(page)).toHaveText('Cartão', { timeout: 4000 });
  expect(await selectValue(page)).toBe('cartao');
  await expect(page.locator(`${TOAST} li.error`)).toHaveCount(0);
});

test('opção inexistente é reportada sem efeito colateral', async ({ context, extensionId }) => {
  await prepare(context, extensionId, [
    [TIPO, 'Inexistente'],
    [PAGAMENTO, 'Cheque'],
  ]);
  const page = await open(context, '?initial=1');
  await expect(page.locator(`${TOAST} li.error`)).toHaveCount(2, { timeout: 4000 });
  await expect(page.locator(`${TOAST} li.error`).first()).toContainText('não encontrada');

  await expect(reactValue(page)).toHaveText('Retorno');
  await expect(select2Rendered(page)).toHaveText('Cartão');
  expect(await selectValue(page)).toBe('cartao');
  const log = await logs(page);
  expect(log.reactChanges).toEqual([]);
  expect(log.select2Changes).toEqual([]);
  // o menu do React-Select não ficou aberto e o filtro digitado foi limpo
  await expect(page.locator('[id^="react-select-"][id$="-listbox"]')).toHaveCount(0);
  await expect(page.locator('#tipo-atendimento')).toHaveValue('');
});

test('detecção auto numa página mista', async ({ context }) => {
  const page = await open(context);
  await page.addScriptTag({ content: bundle });
  const resolve = (label: string) =>
    page.evaluate((text) => {
      const l = Array.from(document.querySelectorAll('label.eui-label')).find(
        (x) => x.textContent?.trim() === text,
      );
      const root = l?.closest('.eui-field');
      if (!root) throw new Error(`campo não encontrado: ${text}`);
      return (
        (window as unknown as LibsWindow).__adapters.registry.resolve(root, 'auto')?.id ?? null
      );
    }, label);
  expect(await resolve(NOTA)).toBe('contenteditable');
  expect(await resolve(TIPO)).toBe('react-select');
  expect(await resolve(PAGAMENTO)).toBe('select2');
  expect(await resolve('Campo comum')).toBe('native-text');
});
