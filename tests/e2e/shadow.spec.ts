import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeApi {
  chrome: {
    tabs: {
      query(q: { url?: string }): Promise<{ id?: number }[]>;
      sendMessage(tabId: number, message: unknown): Promise<unknown>;
    };
    storage: {
      sync: {
        get(k: string): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
      };
    };
  };
}
type ShadowWindow = Window & { __shadowEvents: string[] };

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const label = (text: string) => ({ by: 'label', text });

function textField(id: string, locator: unknown, value: string) {
  return { id, enabled: true, locator, adapter: 'native-text', value };
}

/** Troca os campos da regra e2e (semeada pelo background) pelos do teste. */
async function prepare(ext: Page, fields: unknown[]) {
  await expect
    .poll(() =>
      ext.evaluate(
        async () =>
          'rule:e2e-harness' in
          (await (globalThis as unknown as ChromeApi).chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
  await ext.evaluate(async (fs) => {
    const { chrome } = globalThis as unknown as ChromeApi;
    const got = await chrome.storage.sync.get('rule:e2e-harness');
    const rule = got['rule:e2e-harness'] as { fields: unknown[] };
    rule.fields = fs;
    await chrome.storage.sync.set({ 'rule:e2e-harness': rule });
  }, fields);
}

async function openExt(context: BrowserContext, extensionId: string): Promise<Page> {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html?tabId=0`);
  return ext;
}

test('preenche campos dentro de shadow roots (a, b, c, e) e ignora o closed (d)', async ({
  context,
  extensionId,
}) => {
  const ext = await openExt(context, extensionId);
  await prepare(ext, [
    textField('a', label('Campo A (rótulo fora)'), 'valor-a'),
    textField('b', label('Campo B (rótulo dentro)'), 'valor-b'),
    textField('c', label('Campo C (aninhado)'), 'valor-c'),
    textField('d', label('Campo D (closed)'), 'valor-d'),
    textField('e', label('Campo E (tardio)'), 'valor-e'),
  ]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${baseURL}/shadow.html`);

  await expect(page.locator('#a-input')).toHaveValue('valor-a', { timeout: 4000 });
  await expect(page.locator('#b-input')).toHaveValue('valor-b', { timeout: 4000 });
  await expect(page.locator('#c-input')).toHaveValue('valor-c', { timeout: 4000 });
  // inserido no shadow só depois de 500 ms: o watcher precisa ver a mutação
  await expect(page.locator('#e-input')).toHaveValue('valor-e', { timeout: 6000 });
  // closed: inacessível por design; nada preenchido e nenhum erro
  expect(
    await page.evaluate(() => {
      const host = document.getElementById('host-d');
      return host?.shadowRoot === null;
    }),
  ).toBe(true);
  expect(errors).toEqual([]);

  // eventos `composed`: os ouvintes do document recebem input/change vindos do shadow
  const seen = await page.evaluate(() => (window as unknown as ShadowWindow).__shadowEvents);
  expect(seen).toContain('input:a-input');
  expect(seen).toContain('change:b-input');
  expect(seen).toContain('input:c-input');
});

test('seletor com >>> preenche o input dentro do shadow', async ({ context, extensionId }) => {
  const ext = await openExt(context, extensionId);
  await prepare(ext, [
    textField('f', { by: 'selector', css: '#host-f >>> #f-input' }, 'via-seletor'),
  ]);
  const page = await context.newPage();
  await page.goto(`${baseURL}/shadow.html`);
  await expect(page.locator('#f-input')).toHaveValue('via-seletor', { timeout: 4000 });
});

const BANNER = 'Clique no campo que deseja preencher automaticamente';

async function startPicker(ext: Page, tabId: number) {
  await ext.evaluate(
    (id) =>
      (globalThis as unknown as ChromeApi).chrome.tabs.sendMessage(id, { type: 'picker/start' }),
    tabId,
  );
}

async function setupPicker(context: BrowserContext, extensionId: string) {
  const ext = await openExt(context, extensionId);
  await prepare(ext, [textField('a', label('Campo A (rótulo fora)'), 'valor-a')]);
  const page = await context.newPage();
  await page.goto(`${baseURL}/shadow.html`);
  await expect(page.locator('#a-input')).toHaveValue('valor-a', { timeout: 4000 });
  await expect(page.locator('#e-input')).toBeAttached({ timeout: 3000 });
  const tabId = await ext.evaluate(async (u) => {
    const tabs = await (globalThis as unknown as ChromeApi).chrome.tabs.query({ url: u });
    return tabs[0]?.id ?? -1;
  }, `${baseURL}/*`);
  expect(tabId).toBeGreaterThan(-1);
  return { ext, page, tabId };
}

async function capture(
  context: BrowserContext,
  page: Page,
  ext: Page,
  tabId: number,
  target: ReturnType<Page['locator']>,
): Promise<Page> {
  await startPicker(ext, tabId);
  await expect(page.getByText(BANNER)).toBeVisible();
  const opened = context.waitForEvent('page');
  await target.click();
  const options = await opened;
  await options.waitForLoadState();
  return options;
}

test('capturar campo com rótulo dentro do shadow gera locator por rótulo', async ({
  context,
  extensionId,
}) => {
  const { ext, page, tabId } = await setupPicker(context, extensionId);
  const options = await capture(context, page, ext, tabId, page.locator('#b-input'));
  await options.getByTestId('capture-new-rule').click();
  const card = options.locator('[data-field-id]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.f-by')).toHaveValue('label');
  await expect(card.locator('.f-locator')).toHaveValue('Campo B (rótulo dentro)');
  await expect(card.locator('.f-type')).toHaveValue('native-text');
});

test('capturar campo sem rótulo gera `host >>> interno` que funciona ao salvar a regra', async ({
  context,
  extensionId,
}) => {
  const { ext, page, tabId } = await setupPicker(context, extensionId);
  const options = await capture(context, page, ext, tabId, page.locator('#f-input'));
  await options.getByTestId('capture-add-to-rule').click();
  const cards = options.locator('[data-field-id]');
  await expect(cards).toHaveCount(2);
  const added = cards.nth(1);
  await expect(added.locator('.f-by')).toHaveValue('selector');
  await expect(added.locator('.f-locator')).toHaveValue(/ >>> .*input/);
  await added.locator('.f-value').fill('capturado');
  await options.getByTestId('save-rule').click();
  await expect(options.getByTestId('notice')).toContainText('Regra salva');

  // o locator gerado, aplicado pelo motor numa página nova, localiza e preenche o campo
  const fresh = await context.newPage();
  await fresh.goto(`${baseURL}/shadow.html`);
  await expect(fresh.locator('#f-input')).toHaveValue('capturado', { timeout: 5000 });
});
