import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeStorage {
  storage: {
    sync: { get(k?: string | null): Promise<Record<string, unknown>>; clear(): Promise<void> };
  };
  tabs: { query(q: { url: string }): Promise<{ id?: number }[]> };
  scripting: {
    executeScript(i: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
}
declare const chrome: ChromeStorage;

const TOAST = '[data-assistente-preenchimento]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const newRule = (id: string, name: string, pattern: string) => ({
  id,
  name,
  enabled: true,
  trigger: { urlPatterns: [pattern] },
  behavior: { mode: 'auto' },
  fields: [{ id: 'f1', locator: { by: 'label', text: 'Nome' }, value: 'Fulano' }],
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const ruleKeys = (page: Page) =>
  page.evaluate(async () =>
    Object.keys(await chrome.storage.sync.get(null))
      .filter((k) => k.startsWith('rule:'))
      .sort(),
  );

async function openOptions(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/options.html?e2eDenyPermissions=1`);
  await expect(page.locator('[data-rule-id="e2e-harness"]')).toBeVisible();
}

const addFile = async (page: Page, name: string, content: unknown) => {
  await page.getByRole('tab', { name: 'Importar/Exportar' }).click();
  await page.getByTestId('add-file').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
  });
};

test('adicionar regras de um arquivo: mescla, renomeia id repetido e não apaga nada', async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  const before = await ruleKeys(page);
  expect(before).toContain('rule:e2e-harness');
  const original = await page.evaluate(
    async () => (await chrome.storage.sync.get('rule:e2e-harness'))['rule:e2e-harness'],
  );

  // Uma regra no formato do preset, com id que já existe e site novo (sem permissão no e2e).
  await addFile(
    page,
    'regra.json',
    newRule('e2e-harness', 'Regra de outro site', 'https://novo-site.test/*'),
  );
  const preview = page.getByTestId('add-preview');
  await expect(preview).toContainText('vai adicionar 1 regra');
  await expect(preview).toContainText('Regra de outro site');
  await expect(page.getByTestId('add-renamed')).toBeVisible();
  await page.getByTestId('confirm-add').click();

  await expect(page.getByTestId('notice')).toHaveText('Regra adicionada');
  await page.getByRole('tab', { name: 'Regras' }).click();
  await expect(page.locator('.rule-item', { hasText: 'Regra de outro site' })).toBeVisible();
  // permissão negada no e2e: segue o fluxo do pedido sob demanda
  await expect(page.getByTestId('perm-denied')).toContainText('novo-site.test');

  const after = await ruleKeys(page);
  expect(after).toHaveLength(before.length + 1);
  for (const k of before) expect(after).toContain(k);
  const kept = await page.evaluate(
    async () => (await chrome.storage.sync.get('rule:e2e-harness'))['rule:e2e-harness'],
  );
  expect(kept).toEqual(original);
});

test('adicionar de uma configuração completa soma regras e variáveis novas', async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  const before = await ruleKeys(page);
  await addFile(page, 'config.json', {
    schemaVersion: 1,
    settings: { pausedHosts: [] },
    variables: [{ key: 'cidade_exemplo', label: 'Cidade', value: 'Recife' }],
    rules: [
      newRule('regra-a', 'Regra A', 'https://a.exemplo.test/*'),
      newRule('regra-b', 'Regra B', 'https://b.exemplo.test/*'),
    ],
  });
  await expect(page.getByTestId('add-preview')).toContainText('vai adicionar 2 regras');
  await page.getByTestId('confirm-add').click();
  await expect(page.getByTestId('notice')).toHaveText('2 regras adicionadas');

  expect(await ruleKeys(page)).toHaveLength(before.length + 2);
  const vars = await page.evaluate(
    async () => (await chrome.storage.sync.get('cfg:variables'))['cfg:variables'],
  );
  expect(vars).toEqual([{ key: 'cidade_exemplo', label: 'Cidade', value: 'Recife' }]);
});

test('arquivo inválido mostra o erro e não grava nada', async ({ page, extensionId }) => {
  await openOptions(page, extensionId);
  const before = await ruleKeys(page);
  await addFile(page, 'ruim.json', '{ não é json');
  await expect(page.getByTestId('add-error')).toContainText('não é um JSON válido');
  await expect(page.getByTestId('add-preview')).toHaveCount(0);
  expect(await ruleKeys(page)).toEqual(before);
});

test('options vazia: estado inicial com os 3 caminhos e importação do exemplo', async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  await page.evaluate(() => chrome.storage.sync.clear());

  const empty = page.getByTestId('empty-state');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('Nenhuma regra ainda');
  await expect(page.getByTestId('empty-new-rule')).toBeVisible();
  await expect(page.getByTestId('empty-capture')).toContainText('ícone da extensão');
  await expect(page.getByTestId('empty-import-example')).toBeVisible();

  await page.getByTestId('empty-new-rule').click();
  await expect(page.getByRole('heading', { name: 'Nova regra' })).toBeVisible();
  await page.getByTestId('cancel-edit').click();

  await page.getByTestId('empty-import-example').click();
  await expect(page.locator('[data-rule-id="exemplo-cadastro"]')).toBeVisible();
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
});

test('o pacote de produção não cita a Clínica Experts', () => {
  const dir = path.resolve(import.meta.dirname, '../../.output/chrome-mv3');
  test.skip(!existsSync(dir), 'rode `npm run build` antes (pacote de produção ausente)');
  const hits: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html|json|css)$/.test(e.name)) {
        const t = readFileSync(p, 'utf8');
        if (/Cl(í|\\u00ed)nica Experts/i.test(t) || /clinicaexperts/i.test(t)) hits.push(p);
      }
    }
  };
  walk(dir);
  expect(hits).toEqual([]);
});

test('injetar o content script duas vezes não duplica o motor', async ({
  context,
  extensionId,
}) => {
  const ext = await context.newPage();
  await openOptions(ext, extensionId);

  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  const tabId = await ext.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0]?.id ?? -1,
    `${baseURL}/*`,
  );
  expect(tabId).toBeGreaterThan(-1);
  const file = await ext.evaluate(() => {
    const m = (
      globalThis as unknown as {
        chrome: { runtime: { getManifest(): { content_scripts?: { js?: string[] }[] } } };
      }
    ).chrome.runtime.getManifest();
    return m.content_scripts?.[0]?.js?.[0] ?? '';
  });
  expect(file).not.toBe('');
  for (let i = 0; i < 2; i++) {
    await ext.evaluate(
      ({ id, f }) => chrome.scripting.executeScript({ target: { tabId: id }, files: [f] }),
      { id: tabId, f: file },
    );
  }

  await page.click('#open-nfse');
  await expect(page.locator(`${TOAST} .summary`)).toContainText(/[23] preenchidos/, {
    timeout: 5000,
  });
  await expect(page.locator(TOAST)).toHaveCount(1);
});

test('popup em aba sem content script: capturar nesta página falha com aviso, sem travar', async ({
  context,
  extensionId,
}) => {
  const ext = await context.newPage();
  await openOptions(ext, extensionId);
  const blank = await context.newPage();
  await blank.goto('about:blank');
  const blankId = await ext.evaluate(
    async () => (await chrome.tabs.query({ url: 'about:blank' }))[0]?.id ?? -1,
  );
  await ext.goto(`chrome-extension://${extensionId}/popup.html?tabId=${blankId}`);
  await expect(ext.getByText('Nenhuma regra para este site')).toBeVisible({ timeout: 4000 });
  await ext.getByTestId('capture-here').click();
  await expect(ext.getByRole('alert')).toContainText('Não foi possível capturar nesta página');
  await expect(ext.getByTestId('capture-here')).toBeEnabled();
});
