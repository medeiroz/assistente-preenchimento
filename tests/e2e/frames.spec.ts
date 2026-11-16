import { test, expect } from './fixtures';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
declare const chrome: {
  storage: { sync: ChromeArea; local: ChromeArea };
  tabs: {
    query(q: { url?: string }): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};

const TOAST = '[data-assistente-preenchimento]';
const BUTTON_HOST = '[data-assistente-acao]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const BOTH = ['http://localhost/*', 'http://127.0.0.1/*'];

function rule(
  id: string,
  opts: { frames?: 'all'; mode?: 'auto' | 'button'; patterns?: string[] } = {},
) {
  return {
    id,
    name: `Regra ${id}`,
    enabled: true,
    trigger: {
      urlPatterns: opts.patterns ?? BOTH,
      container: { selector: 'form.alvo' },
      settleMs: 100,
      ...(opts.frames ? { frames: opts.frames } : {}),
    },
    behavior: { mode: opts.mode ?? 'auto', overwrite: 'always', refill: 'oncePerAppearance' },
    fields: [
      {
        id: 'nome',
        enabled: true,
        locator: { by: 'label', text: 'Nome do iframe' },
        adapter: 'native-text',
        value: 'Maria',
      },
    ],
    updatedAt: '2026-11-13T00:00:00.000Z',
  };
}

/** Página da extensão para falar com a aba. `popup` evita que a captura reuse a página de opções. */
async function openExt(
  context: BrowserContext,
  extensionId: string,
  html = 'options.html',
): Promise<Page> {
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/${html}`);
  await expect
    .poll(() =>
      ext.evaluate(
        async () => 'rule:e2e-harness' in (await chrome.storage.sync.get('rule:e2e-harness')),
      ),
    )
    .toBe(true);
  return ext;
}

async function install(ext: Page, rules: ReturnType<typeof rule>[]) {
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

async function tabIdOf(ext: Page): Promise<number> {
  const id = await ext.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({ url: u });
    return tabs[0]?.id ?? -1;
  }, `${baseURL}/frames.html*`);
  expect(id).toBeGreaterThan(-1);
  return id;
}

async function openFrames(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseURL}/frames.html`);
  // O iframe de outra origem carrega depois do script da página.
  await expect(page.frameLocator('#cross').locator('#nome')).toBeAttached();
  await expect(page.frameLocator('#srcdoc').locator('#nome')).toBeAttached();
  return page;
}

const nome = (page: Page, id: 'same' | 'srcdoc' | 'cross'): Locator =>
  page.frameLocator(`#${id}`).locator('#nome');

const ruleIds = (ext: Page): Promise<string[]> =>
  ext.evaluate(async () =>
    Object.keys(await chrome.storage.sync.get(null))
      .filter((k) => k.startsWith('rule:'))
      .map((k) => k.slice(5)),
  );

const popupUrl = (extensionId: string, tabId: number) =>
  `chrome-extension://${extensionId}/popup.html?tabId=${tabId}`;

test('regra com frames "all" preenche iframe de mesma origem, srcdoc e outra origem; toast no topo', async ({
  context,
  extensionId,
}) => {
  const ext = await openExt(context, extensionId);
  await install(ext, [rule('fr-all', { frames: 'all' })]);
  try {
    // Dá tempo ao content script de receber a regra.
    await ext.waitForTimeout(500);
    const page = await openFrames(context);
    await expect(nome(page, 'same')).toHaveValue('Maria', { timeout: 5000 });
    await expect(nome(page, 'srcdoc')).toHaveValue('Maria', { timeout: 5000 });
    await expect(nome(page, 'cross')).toHaveValue('Maria', { timeout: 5000 });

    // O toast aparece no frame de topo, não dentro dos iframes.
    await expect(page.locator(`${TOAST} .summary`)).toContainText('preenchidos');
    for (const id of ['same', 'srcdoc', 'cross'] as const) {
      await expect(page.frameLocator(`#${id}`).locator(TOAST)).toHaveCount(0);
    }
  } finally {
    await uninstall(ext, ['fr-all']);
    await ext.close();
  }
});

test('regra sem "frames" não roda em iframe', async ({ context, extensionId }) => {
  const ext = await openExt(context, extensionId);
  await install(ext, [rule('fr-top')]);
  try {
    await ext.waitForTimeout(500);
    const page = await openFrames(context);
    await page.waitForTimeout(1500);
    for (const id of ['same', 'srcdoc', 'cross'] as const) {
      await expect(nome(page, id)).toHaveValue('');
    }
    await expect(page.locator(TOAST)).toHaveCount(0);
  } finally {
    await uninstall(ext, ['fr-top']);
    await ext.close();
  }
});

test('popup lista a regra do iframe; "Preencher agora" e "Desfazer" atuam no frame certo', async ({
  context,
  extensionId,
}) => {
  const ext = await openExt(context, extensionId);
  // Só o iframe de outra origem (localhost) casa; modo botão: nada preenche sozinho.
  await install(ext, [
    rule('fr-pop', { frames: 'all', mode: 'button', patterns: ['http://localhost/*'] }),
  ]);
  try {
    await ext.waitForTimeout(500);
    const page = await openFrames(context);
    await expect(page.locator(`${BUTTON_HOST} >> button`)).toHaveCount(1);
    const tabId = await tabIdOf(ext);

    await ext.goto(popupUrl(extensionId, tabId));
    const rules = ext.getByTestId('rules');
    await expect(rules).toContainText('Regra fr-pop');
    await expect(rules).toContainText('(iframe)');
    await expect(rules.getByTestId('rule-iframe')).toHaveCount(1);

    await ext.getByRole('button', { name: 'Preencher agora' }).click();
    await expect(nome(page, 'cross')).toHaveValue('Maria', { timeout: 5000 });
    await expect(nome(page, 'same')).toHaveValue('');
    await expect(nome(page, 'srcdoc')).toHaveValue('');
    await expect(ext.getByTestId('report-summary')).toContainText('preenchidos');

    await ext.getByRole('button', { name: 'Desfazer' }).click();
    await expect(nome(page, 'cross')).toHaveValue('', { timeout: 5000 });
    await expect(ext.getByTestId('report-fields')).toContainText('Desfeito');
  } finally {
    await uninstall(ext, ['fr-pop']);
    await ext.close();
  }
});

test('botão de ação do iframe aparece no topo e o clique preenche o iframe', async ({
  context,
  extensionId,
}) => {
  const ext = await openExt(context, extensionId);
  await install(ext, [
    rule('fr-btn', { frames: 'all', mode: 'button', patterns: ['http://localhost/*'] }),
  ]);
  try {
    await ext.waitForTimeout(500);
    const page = await openFrames(context);
    const button = page.locator(`${BUTTON_HOST} >> button`);
    await expect(button).toHaveCount(1);
    await expect(button).toContainText('Regra fr-btn');
    await expect(page.frameLocator('#cross').locator(BUTTON_HOST)).toHaveCount(0);
    await expect(nome(page, 'cross')).toHaveValue('');

    await button.click();
    await expect(nome(page, 'cross')).toHaveValue('Maria', { timeout: 5000 });
    await expect(page.locator(`${TOAST} .summary`)).toContainText('preenchidos');

    // "Desfazer" do toast no topo volta para o iframe.
    await page.locator(`${TOAST} .undo`).click();
    await expect(nome(page, 'cross')).toHaveValue('', { timeout: 5000 });
  } finally {
    await uninstall(ext, ['fr-btn']);
    await ext.close();
  }
});

test('captura dentro do iframe gera rascunho com o padrão do frame e frames "all"', async ({
  context,
  extensionId,
}) => {
  const ext = await openExt(context, extensionId, 'popup.html?tabId=0');
  const before = await ruleIds(ext);
  const page = await openFrames(context);
  const tabId = await tabIdOf(ext);
  await ext.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'picker/start' }), tabId);
  // A faixa fica só no topo; o iframe mostra só o destaque do campo.
  await expect(page.getByText('Clique no campo')).toBeVisible();
  await expect(page.frameLocator('#cross').getByText('Clique no campo')).toHaveCount(0);

  const opened = context.waitForEvent('page');
  await page.frameLocator('#cross').locator('#nome').click();
  const options = await opened;
  await options.waitForLoadState();

  // A captura terminou em todos os frames.
  await expect(page.locator('[data-assistente-captura]')).toHaveCount(0);
  await expect(page.frameLocator('#cross').locator('[data-assistente-captura]')).toHaveCount(0);

  await expect(options.getByRole('heading', { name: 'Nova regra' })).toBeVisible();
  // Padrão da URL do iframe (localhost), não da página de topo (127.0.0.1).
  await expect(options.locator('#url-0')).toHaveValue('http://localhost/*');
  await expect(options.locator('#all-frames')).toBeChecked();
  await expect(options.getByTestId('info-frames')).toBeVisible();
  await expect(options.locator('[data-field-id] .f-locator')).toHaveValue('Nome do iframe');

  // Salvar grava `frames: 'all'`; desmarcar remove a chave.
  await options.locator('#rule-name').fill('Captura em iframe');
  await options.locator('[data-field-id] .f-value').fill('Joana');
  await options.getByTestId('save-rule').click();
  await expect(options.getByTestId('notice')).toContainText('Regra salva');
  const created = (await ruleIds(options)).filter((id) => !before.includes(id));
  expect(created).toHaveLength(1);
  const saved = await options.evaluate(async (id) => {
    const got = await chrome.storage.sync.get(`rule:${id}`);
    return got[`rule:${id}`] as { trigger: { frames?: string; urlPatterns: string[] } };
  }, created[0]!);
  expect(saved.trigger.frames).toBe('all');
  expect(saved.trigger.urlPatterns).toEqual(['http://localhost/*']);
  await uninstall(options, created);
});

test('Escape num iframe encerra a captura em todos os frames', async ({ context, extensionId }) => {
  const ext = await openExt(context, extensionId, 'popup.html?tabId=0');
  const page = await openFrames(context);
  const tabId = await tabIdOf(ext);
  await page.bringToFront();
  await ext.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'picker/start' }), tabId);
  await expect(page.getByText('Clique no campo')).toBeVisible();
  await page.frameLocator('#same').locator('#nome').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-assistente-captura]')).toHaveCount(0);
  await expect(page.frameLocator('#same').locator('[data-assistente-captura]')).toHaveCount(0);
  await expect(page.frameLocator('#cross').locator('[data-assistente-captura]')).toHaveCount(0);
});
