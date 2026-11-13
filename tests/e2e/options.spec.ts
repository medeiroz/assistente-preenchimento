import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
}
declare const chrome: { storage: { sync: ChromeArea; local: ChromeArea } };
type HarnessWindow = Window & {
  __harness: { getState(): Record<string, unknown>; close(): void };
};

interface StoredRule {
  id: string;
  name: string;
  enabled: boolean;
  fields: { id: string; value: string }[];
}

const E2E_ID = 'e2e-harness';
const E2E_NAME = 'E2E — harness de NFS-e';
const CE_NAME = 'CE — NFS-e: NBS e consumo pessoal';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const readSync = (page: Page) =>
  page.evaluate(() => chrome.storage.sync.get(null) as Promise<Record<string, unknown>>);

const storedRule = async (page: Page, id: string) =>
  ((await readSync(page))[`rule:${id}`] as StoredRule | undefined) ?? undefined;

async function openOptions(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // O seed é gravado pelo background; a lista reage ao storage.
  await expect(page.locator(`[data-rule-id="${E2E_ID}"]`)).toBeVisible();
  return page;
}

const item = (page: Page, id: string) => page.locator(`[data-rule-id="${id}"]`);
const fieldCard = (page: Page, id: string) => page.locator(`[data-field-id="${id}"]`);

async function editE2eRule(page: Page) {
  await item(page, E2E_ID).locator('[data-action="edit"]').click();
  await expect(page.getByRole('heading', { name: 'Editar regra' })).toBeVisible();
}

const nbs = (page: Page) => page.evaluate(() => (window as HarnessWindow).__harness.getState().nbs);

async function openModal(page: Page) {
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
}

async function reopenModal(page: Page) {
  await page.evaluate(() => (window as HarnessWindow).__harness.close());
  await expect(page.locator('.eui-modal-title')).toHaveCount(0);
  await page.waitForTimeout(300);
  await openModal(page);
}

test('a) lista mostra as regras do seed, agrupadas por site', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Assistente de Preenchimento — Configurações',
  );
  await expect(page.getByRole('tab')).toHaveText([
    'Regras',
    'Variáveis',
    'Histórico',
    'Importar/Exportar',
  ]);
  await expect(page.locator('.rule-name', { hasText: CE_NAME })).toBeVisible();
  await expect(page.locator('.rule-name', { hasText: E2E_NAME })).toBeVisible();
  await expect(
    page.locator('.group-title', { hasText: 'app.clinicaexperts.com.br' }),
  ).toBeVisible();
  await expect(item(page, E2E_ID)).toContainText('Automático');
  await expect(item(page, E2E_ID)).toContainText('3 campos');
});

test('b) editar o valor do NBS e salvar reflete no storage e no harness', async ({
  context,
  extensionId,
  page: harness,
}) => {
  const page = await openOptions(context, extensionId);
  await editE2eRule(page);
  await fieldCard(page, 'nbs').locator('.f-value').fill('222222222');
  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('notice')).toHaveText('Regra salva');
  await expect(page.getByRole('heading', { name: 'Regras', level: 2 })).toBeVisible();

  const rule = await storedRule(page, E2E_ID);
  expect(rule?.fields.find((f) => f.id === 'nbs')?.value).toBe('222222222');
  expect(rule?.fields).toHaveLength(3);

  await harness.goto(`${baseURL}/`);
  await openModal(harness);
  await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('222222222');
});

test('c) criar regra válida; nome vazio mostra erro e não salva', async ({
  context,
  extensionId,
}) => {
  const page = await openOptions(context, extensionId);
  const before = Object.keys(await readSync(page)).filter((k) => k.startsWith('rule:')).length;

  // nome vazio
  await page.getByTestId('new-rule').click();
  await page.locator('.url-pattern').first().fill('https://exemplo.com/*');
  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('error-summary')).toBeVisible();
  await expect(page.getByTestId('error-summary')).toContainText('Nome da regra');
  await expect(page.locator('#rule-name')).toHaveAttribute('aria-invalid', 'true');
  expect(Object.keys(await readSync(page)).filter((k) => k.startsWith('rule:'))).toHaveLength(
    before,
  );

  // agora válida
  await page.locator('#rule-name').fill('Minha regra nova');
  await page.getByTestId('add-field').click();
  await fieldCard(page, 'campo-1').locator('.f-locator').fill('Nome do cliente');
  await fieldCard(page, 'campo-1').locator('.f-value').fill('Fulano');
  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('notice')).toHaveText('Regra salva');
  await expect(page.locator('.rule-name', { hasText: 'Minha regra nova' })).toBeVisible();
  await expect(page.locator('.group-title', { hasText: 'exemplo.com' })).toBeVisible();

  const all = await readSync(page);
  const key = Object.keys(all).find((k) => k.startsWith('rule:minha-regra-nova-'));
  expect(key).toBeTruthy();
  const rule = all[key as string] as StoredRule;
  expect(rule.name).toBe('Minha regra nova');
  expect(rule.fields).toHaveLength(1);
  expect(rule.fields[0]?.value).toBe('Fulano');
  expect((all['cfg:meta'] as { ruleIds: string[] }).ruleIds).toContain(rule.id);
});

test('d) expressão inválida mostra erro ao vivo e bloqueia o salvamento', async ({
  context,
  extensionId,
}) => {
  const page = await openOptions(context, extensionId);
  await editE2eRule(page);
  const value = fieldCard(page, 'nbs').locator('.f-value');
  await value.fill('{{ var. }}');
  await expect(fieldCard(page, 'nbs').locator('.error-text')).toContainText('posição');
  await expect(value).toHaveAttribute('aria-invalid', 'true');

  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('error-summary')).toBeVisible();
  await expect(page.getByTestId('notice')).toHaveCount(0);
  expect((await storedRule(page, E2E_ID))?.fields.find((f) => f.id === 'nbs')?.value).toBe(
    '126029000',
  );

  await value.fill('126029000');
  await expect(fieldCard(page, 'nbs').locator('.error-text')).toHaveCount(0);
});

test('e) desligar pelo switch impede o preenchimento; religar volta a preencher', async ({
  context,
  extensionId,
  page: harness,
}) => {
  const page = await openOptions(context, extensionId);
  const sw = item(page, E2E_ID).getByRole('switch');
  await expect(sw).toBeChecked();

  await sw.uncheck();
  await expect.poll(async () => (await storedRule(page, E2E_ID))?.enabled).toBe(false);
  await harness.goto(`${baseURL}/`);
  await openModal(harness);
  await harness.waitForTimeout(1500);
  expect(await nbs(harness)).toBe('');

  await sw.check();
  await expect.poll(async () => (await storedRule(page, E2E_ID))?.enabled).toBe(true);
  await page.waitForTimeout(500);
  await reopenModal(harness);
  await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('126029000');
});

test('f) duplicar e excluir (aceitando a confirmação)', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);
  await item(page, E2E_ID).locator('[data-action="duplicate"]').click();
  const copy = page.locator('.rule-item', { hasText: `${E2E_NAME} (cópia)` });
  await expect(copy).toBeVisible();
  const copyId = await copy.getAttribute('data-rule-id');
  expect(copyId).toBeTruthy();
  expect(copyId).not.toBe(E2E_ID);
  const stored = await storedRule(page, copyId as string);
  expect(stored?.name).toBe(`${E2E_NAME} (cópia)`);
  expect(stored?.fields).toHaveLength(3);

  const messages: string[] = [];
  page.on('dialog', (d) => {
    messages.push(d.message());
    void d.accept();
  });
  await copy.locator('[data-action="remove"]').click();
  await expect(page.locator(`[data-rule-id="${copyId}"]`)).toHaveCount(0);
  expect(messages[0]).toContain('Excluir');
  expect(await storedRule(page, copyId as string)).toBeUndefined();
  expect(await storedRule(page, E2E_ID)).toBeTruthy();
});

test('f2) recusar a confirmação não exclui', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);
  page.on('dialog', (d) => void d.dismiss());
  await item(page, E2E_ID).locator('[data-action="remove"]').click();
  await page.waitForTimeout(300);
  await expect(item(page, E2E_ID)).toBeVisible();
  expect(await storedRule(page, E2E_ID)).toBeTruthy();
});

test('g) exportar e importar o mesmo arquivo mantém a configuração', async ({
  context,
  extensionId,
}) => {
  const page = await openOptions(context, extensionId);
  await page.getByRole('tab', { name: 'Importar/Exportar' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^assistente-config-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8')) as {
    schemaVersion: number;
    rules: { id: string }[];
  };
  expect(exported.schemaVersion).toBe(1);
  expect(exported.rules.map((r) => r.id)).toContain(E2E_ID);

  const before = await readSync(page);
  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByTestId('import-preview')).toContainText(`${exported.rules.length} regras`);
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('ie-message')).toContainText('importada');
  expect(await readSync(page)).toEqual(before);
});

test('g2) importar JSON inválido mostra erro e não altera nada', async ({
  context,
  extensionId,
}) => {
  const page = await openOptions(context, extensionId);
  await page.getByRole('tab', { name: 'Importar/Exportar' }).click();
  const before = await readSync(page);

  await page.getByTestId('import-file').setInputFiles({
    name: 'quebrado.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ isto não é json'),
  });
  await expect(page.getByTestId('ie-error')).toContainText('JSON');
  await expect(page.getByTestId('import-preview')).toHaveCount(0);

  await page.getByTestId('import-file').setInputFiles({
    name: 'vazio.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByTestId('ie-error')).toContainText('não parece');
  expect(await readSync(page)).toEqual(before);
});

test('h) histórico mostra o relatório depois de um preenchimento', async ({
  context,
  extensionId,
  page: harness,
}) => {
  const page = await openOptions(context, extensionId);
  await harness.goto(`${baseURL}/?ref=segredo123`);
  await openModal(harness);
  await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('126029000');
  await expect
    .poll(async () => {
      const h = (await page.evaluate(() => chrome.storage.local.get('history'))).history;
      return Array.isArray(h) ? h.length : 0;
    })
    .toBeGreaterThan(0);

  await page.getByRole('tab', { name: 'Histórico' }).click();
  const entry = page.locator('.history-item').first();
  await expect(entry).toContainText(E2E_NAME);
  await expect(entry).toContainText(/preenchido/);
  await expect(entry).not.toContainText('segredo123');
  await entry.locator('summary').click();
  await expect(entry.locator('.h-fields li').first()).toBeVisible();

  page.on('dialog', (d) => void d.accept());
  await page.getByTestId('clear-history').click();
  await expect(page.locator('.history-item')).toHaveCount(0);
});

test('i) mudança externa da regra em edição mostra aviso', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);
  await editE2eRule(page);
  await expect(page.getByTestId('external-change')).toHaveCount(0);

  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(item(other, E2E_ID)).toBeVisible();
  await item(other, E2E_ID).getByRole('switch').uncheck();

  await expect(page.getByTestId('external-change')).toContainText(
    'Esta regra foi alterada em outro lugar',
  );
});
