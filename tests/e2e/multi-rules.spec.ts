import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
declare const chrome: { storage: { sync: ChromeArea } };
type HarnessWindow = Window & { __harness: { getState(): Record<string, unknown> } };

const BUTTON_HOST = '[data-assistente-acao]';
const TOAST = '[data-assistente-preenchimento]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

function rule(id: string, value: string, mode: 'auto' | 'button', priority?: number) {
  return {
    id,
    name: `Regra ${id}`,
    enabled: true,
    ...(priority !== undefined ? { priority } : {}),
    trigger: {
      urlPatterns: ['http://localhost/*', 'http://127.0.0.1/*'],
      container: {
        selector: '.eui-modal-wrapper.is-active',
        textContains: 'Emitir Nota Fiscal de Serviços Eletrônica',
      },
      settleMs: 300,
    },
    behavior: { mode, overwrite: 'always', refill: 'oncePerAppearance' },
    fields: [
      {
        id: 'descricao',
        enabled: true,
        locator: { by: 'label', text: 'Descrição' },
        adapter: 'native-text',
        value,
      },
    ],
    updatedAt: '2026-11-13T00:00:00.000Z',
  };
}

/** Desliga a regra e2e padrão e instala as regras do teste (ids novos, ao final de ruleIds). */
async function install(ext: Page, rules: ReturnType<typeof rule>[]) {
  await expect
    .poll(() =>
      ext.evaluate(
        async () => 'rule:e2e-harness' in (await chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
  await ext.evaluate(async (rs) => {
    const got = await chrome.storage.sync.get(['cfg:meta', 'rule:e2e-harness']);
    const meta = got['cfg:meta'] as { ruleIds: string[] };
    const base = got['rule:e2e-harness'] as { enabled: boolean };
    base.enabled = false;
    const items: Record<string, unknown> = { 'rule:e2e-harness': base };
    for (const r of rs) items[`rule:${r.id}`] = r;
    items['cfg:meta'] = { ...meta, ruleIds: [...meta.ruleIds, ...rs.map((r) => r.id)] };
    await chrome.storage.sync.set(items);
  }, rules);
}

async function uninstall(ext: Page, ids: string[]) {
  await ext.evaluate(async (rm) => {
    const got = await chrome.storage.sync.get(['cfg:meta', 'rule:e2e-harness']);
    const meta = got['cfg:meta'] as { ruleIds: string[] };
    const base = got['rule:e2e-harness'] as { enabled: boolean };
    base.enabled = true;
    await chrome.storage.sync.set({
      'rule:e2e-harness': base,
      'cfg:meta': { ...meta, ruleIds: meta.ruleIds.filter((x) => !rm.includes(x)) },
    });
    await chrome.storage.sync.remove(rm.map((x) => `rule:${x}`));
  }, ids);
}

async function openExt(context: BrowserContext, extensionId: string): Promise<Page> {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);
  return ext;
}

async function openModal(page: Page) {
  await page.goto(`${baseURL}/`);
  await page.waitForTimeout(500); // o content script recebe as regras novas
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
}

const descricao = (page: Page) =>
  page.evaluate(() => (window as HarnessWindow).__harness.getState().descricao);

test('três regras em modo botão: um "Preencher…" com menu; escolher uma preenche só ela', async ({
  context,
  extensionId,
  page,
}) => {
  const ext = await openExt(context, extensionId);
  const ids = ['m1', 'm2', 'm3'];
  await install(ext, [
    rule('m1', 'valor-um', 'button'),
    rule('m2', 'valor-dois', 'button'),
    rule('m3', 'valor-tres', 'button'),
  ]);
  try {
    await openModal(page);
    const buttons = page.locator(`${BUTTON_HOST} >> button`);
    await expect(buttons).toHaveCount(1);
    const trigger = page.locator(`${BUTTON_HOST} >> button[aria-haspopup="menu"]`);
    await expect(trigger).toHaveText('Preencher…');
    await page.waitForTimeout(800);
    expect(await descricao(page)).toBe('');

    await trigger.click();
    const items = page.locator(`${BUTTON_HOST} >> [role="menuitem"]`);
    await expect(items).toHaveCount(3);
    await expect(items.nth(1)).toContainText('Regra m2');

    // Esc fecha; reabre e escolhe a segunda.
    await page.keyboard.press('Escape');
    await expect(items).toHaveCount(0);
    await trigger.click();
    await items.nth(1).click();

    await expect.poll(() => descricao(page), { timeout: 3000 }).toBe('valor-dois');
    await expect(page.locator(`${TOAST} .summary`)).toContainText(/preenchido/);
    // Sobraram 2 regras com botão: voltam a empilhar, sem menu.
    await expect(page.locator(`${BUTTON_HOST} >> button[aria-haspopup="menu"]`)).toHaveCount(0);
    await expect(page.locator(`${BUTTON_HOST} >> button`)).toHaveCount(2);
  } finally {
    await uninstall(ext, ids);
    await ext.close();
  }
});

test('duas regras auto no mesmo campo: a de maior prioridade preenche', async ({
  context,
  extensionId,
  page,
}) => {
  const ext = await openExt(context, extensionId);
  // A de menor prioridade vem primeiro na configuração.
  await install(ext, [
    rule('p-baixa', 'da-baixa', 'auto', 10),
    rule('p-alta', 'da-alta', 'auto', 90),
  ]);
  try {
    await openModal(page);
    await expect.poll(() => descricao(page), { timeout: 4000 }).toBe('da-alta');
    // Dá tempo de a outra regra rodar: o valor não pode ser sobrescrito.
    await page.waitForTimeout(1200);
    expect(await descricao(page)).toBe('da-alta');
  } finally {
    await uninstall(ext, ['p-baixa', 'p-alta']);
    await ext.close();
  }
});
