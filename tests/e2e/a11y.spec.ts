import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

type ChromeApi = {
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
};

const TOAST = '[data-assistente-preenchimento]';
const BUTTON_HOST = '[data-assistente-acao]';
const PICKER = '[data-assistente-captura]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

/**
 * Roda o axe (WCAG 2 A e AA) e falha em qualquer violação serious/critical, listando id, impacto e
 * alvos. Com `include`, restringe a análise a esses hosts; o axe entra nos shadow roots abertos.
 * Devolve o nº de nós verificados dentro de shadow roots, para provar que as regras rodaram lá.
 */
async function audit(page: Page, include?: string[]): Promise<number> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  for (const selector of include ?? []) builder = builder.include(selector);
  const results = await builder.analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = bad
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' >> ')).join(' | ')}`)
    .join('\n');
  expect(bad, report).toEqual([]);
  return [...results.passes, ...results.violations, ...results.incomplete]
    .flatMap((r) => r.nodes)
    .filter((n) => n.target.length > 1 || n.target.some((t) => Array.isArray(t))).length;
}

async function seeded(context: BrowserContext, extensionId: string): Promise<Page> {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(ext.locator('[data-rule-id="e2e-harness"]')).toBeVisible();
  return ext;
}

const tabIdOf = (ext: Page, pattern: string) =>
  ext.evaluate(async (u) => {
    const tabs = await (globalThis as unknown as ChromeApi).chrome.tabs.query({ url: u });
    return tabs[0]?.id ?? -1;
  }, pattern);

test('popup: com regra e sem regra', async ({ context, extensionId }) => {
  const ext = await seeded(context, extensionId);
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const tabId = await tabIdOf(ext, `${baseURL}/*`);
  expect(tabId).toBeGreaterThan(-1);

  await ext.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(ext.getByTestId('rules')).toContainText('E2E — harness de NFS-e');
  await audit(ext);

  const blank = await context.newPage();
  await blank.goto('about:blank');
  const blankId = await tabIdOf(ext, 'about:blank');
  await ext.goto(`chrome-extension://${extensionId}/popup.html?tabId=${blankId}`);
  await expect(ext.getByText('Nenhuma regra para este site')).toBeVisible({ timeout: 4000 });
  await audit(ext);
});

test('configurações: regras, editor, variáveis, importar/exportar e histórico', async ({
  context,
  extensionId,
}) => {
  const ext = await seeded(context, extensionId);
  await audit(ext);

  await ext.locator('[data-rule-id="e2e-harness"] [data-action="edit"]').click();
  await expect(ext.getByRole('heading', { name: 'Editar regra' })).toBeVisible();
  await audit(ext);
  await ext.getByRole('tab', { name: 'Variáveis' }).click();
  await ext.getByRole('tab', { name: 'Regras' }).click();

  for (const name of ['Variáveis', 'Importar/Exportar', 'Histórico']) {
    await ext.getByRole('tab', { name }).click();
    await expect(ext.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await audit(ext);
  }
});

test('abas das configurações: setas, Home e End movem a seleção', async ({
  context,
  extensionId,
}) => {
  const ext = await seeded(context, extensionId);
  await ext.getByRole('tab').first().focus();
  await ext.keyboard.press('ArrowRight');
  await expect(ext.getByRole('tab', { name: 'Variáveis' })).toBeFocused();
  await expect(ext.getByRole('tab', { name: 'Variáveis' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await ext.keyboard.press('End');
  await expect(ext.getByRole('tab', { name: 'Importar/Exportar' })).toBeFocused();
  await ext.keyboard.press('ArrowRight');
  await expect(ext.getByRole('tab', { name: 'Regras' })).toBeFocused();
  await ext.keyboard.press('ArrowLeft');
  await expect(ext.getByRole('tab', { name: 'Importar/Exportar' })).toBeFocused();
  await ext.keyboard.press('Home');
  await expect(ext.getByRole('tab', { name: 'Regras' })).toBeFocused();
});

test('página: toast, botão de ação e overlay de captura', async ({ context, extensionId }) => {
  const ext = await seeded(context, extensionId);
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const tabId = await tabIdOf(ext, `${baseURL}/*`);
  await page.waitForTimeout(500);

  // Toast (modo automático).
  await page.click('#open-nfse');
  await expect(page.locator(`${TOAST} .summary`)).toContainText('preenchidos');
  await expect(page.locator(`${TOAST} [role="status"], ${TOAST} [role="alert"]`)).toBeAttached();
  expect(await audit(page, [TOAST])).toBeGreaterThan(0);

  // Captura: o overlay fecha com Esc.
  await ext.evaluate(
    (id) =>
      (globalThis as unknown as ChromeApi).chrome.tabs.sendMessage(id, { type: 'picker/start' }),
    tabId,
  );
  await expect(page.locator(PICKER)).toBeAttached();
  expect(await audit(page, [PICKER])).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator(PICKER)).toHaveCount(0);

  // Botão de ação (modo botão).
  await ext.evaluate(async () => {
    const { chrome } = globalThis as unknown as ChromeApi;
    const got = await chrome.storage.sync.get('rule:e2e-harness');
    const rule = got['rule:e2e-harness'] as { behavior: { mode: string } };
    rule.behavior.mode = 'button';
    await chrome.storage.sync.set({ 'rule:e2e-harness': rule });
  });
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('#open-nfse');
  await expect(page.locator(`${BUTTON_HOST} >> button`)).toBeVisible();
  expect(await audit(page, [BUTTON_HOST])).toBeGreaterThan(0);
});
