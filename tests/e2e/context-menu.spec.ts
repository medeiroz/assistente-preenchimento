import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

type ChromeApi = {
  chrome: {
    tabs: { query(q: { url?: string }): Promise<{ id?: number }[]> };
    storage: { sync: { get(k: string): Promise<Record<string, unknown>> } };
  };
};

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

async function setup(
  context: BrowserContext,
  extensionId: string,
): Promise<{ page: Page; tabId: number }> {
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
  return { page, tabId };
}

// O menu nativo não é automatizável: dispara o `contextmenu` na página e chama, no service
// worker, o mesmo handler que o `contextMenus.onClicked` usa, com um `info` sintético.
test('"Capturar este campo": o alvo do contextmenu vira rascunho nas Configurações', async ({
  context,
  extensionId,
}) => {
  const { page, tabId } = await setup(context, extensionId);
  const input = page.locator('.eui-field:has(label.eui-label:text-is("Descrição")) input');
  await input.dispatchEvent('contextmenu');

  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  expect(new URL(worker.url()).host).toBe(extensionId);

  const opened = context.waitForEvent('page');
  await worker.evaluate(
    async ({ tabId: id, url }) => {
      const menu = (
        globalThis as unknown as {
          __assistenteMenu: {
            click(
              info: { menuItemId: string; frameId: number; pageUrl: string },
              tab: { id: number },
            ): Promise<void>;
          };
        }
      ).__assistenteMenu;
      await menu.click({ menuItemId: 'ctx:capture', frameId: 0, pageUrl: url }, { id });
    },
    { tabId, url: `${baseURL}/` },
  );
  const options = await opened;
  await options.waitForLoadState();
  const choice = options.getByTestId('capture-choice');
  await expect(choice).toBeVisible();
  await choice.getByTestId('capture-new-rule').click();
  const card = options.locator('[data-field-id]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.f-locator')).toHaveValue('Descrição');
});
