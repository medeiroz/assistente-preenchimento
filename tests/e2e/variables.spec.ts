import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
}
declare const chrome: {
  storage: { sync: ChromeArea; local: ChromeArea & { clear(): Promise<void> } };
};
type HarnessWindow = Window & {
  __harness: { getState(): Record<string, unknown>; close(): void };
};

interface StoredVariable {
  key: string;
  label: string;
  value: string;
}

const E2E_ID = 'e2e-harness';
const E2E_NAME = 'E2E — harness de NFS-e';
const TOAST = '[data-assistente-preenchimento]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

const readSync = (page: Page) =>
  page.evaluate(() => chrome.storage.sync.get(null) as Promise<Record<string, unknown>>);

const storedVariables = async (page: Page): Promise<StoredVariable[]> =>
  ((await readSync(page))['cfg:variables'] as StoredVariable[] | undefined) ?? [];

async function openOptions(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // O seed é gravado pelo background; a lista reage ao storage.
  await expect(page.locator(`[data-rule-id="${E2E_ID}"]`)).toBeVisible();
  return page;
}

const goVariables = (page: Page) => page.getByRole('tab', { name: 'Variáveis' }).click();
const goRules = (page: Page) => page.getByRole('tab', { name: 'Regras' }).click();
const varRow = (page: Page, key: string) => page.locator(`[data-var-key="${key}"]`);

async function addVariable(page: Page, key: string, value: string, label = ''): Promise<void> {
  await page.getByTestId('add-variable').click();
  const row = page.locator('.var-row').last();
  await row.locator('.v-key').fill(key);
  await row.locator('.v-label').fill(label);
  await row.locator('.v-value').fill(value);
}

async function saveVariables(page: Page): Promise<void> {
  await page.getByTestId('save-variables').click();
  await expect(page.getByTestId('notice')).toHaveText('Variáveis salvas');
}

async function editE2eRule(page: Page): Promise<void> {
  await goRules(page);
  await page.locator(`[data-rule-id="${E2E_ID}"] [data-action="edit"]`).click();
  await expect(page.getByRole('heading', { name: 'Editar regra' })).toBeVisible();
}

async function setNbsValue(page: Page, value: string): Promise<void> {
  await editE2eRule(page);
  await page.locator('[data-field-id="nbs"] .f-value').fill(value);
  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('notice')).toHaveText('Regra salva');
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

test('a) criar variável grava no storage', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);
  await goVariables(page);
  await expect(page.getByTestId('vars-warning')).toContainText('Só neste navegador');
  await expect(page.getByTestId('vars-warning')).toContainText('não é criptografado');
  await expect(page.getByText('Use em qualquer campo como {{ var.sua_chave }}')).toBeVisible();

  await addVariable(page, 'codigo_teste', 'ABC123', 'Código de teste');
  await saveVariables(page);
  expect(await storedVariables(page)).toEqual([
    { key: 'codigo_teste', label: 'Código de teste', value: 'ABC123' },
  ]);
  await expect(varRow(page, 'codigo_teste')).toContainText('Não usada em nenhuma regra');
});

test('b) chave inválida mostra erro e não salva', async ({ context, extensionId }) => {
  const page = await openOptions(context, extensionId);
  await goVariables(page);
  await addVariable(page, 'Código Teste', 'ABC123');
  const key = page.locator('.var-row .v-key').first();
  await expect(key).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.var-row .error-text')).toContainText('Chave inválida');
  await page.getByTestId('save-variables').click();
  await expect(page.getByTestId('notice')).toHaveCount(0);
  expect(await storedVariables(page)).toEqual([]);

  // chave repetida também é recusada
  await key.fill('dup');
  await addVariable(page, 'dup', 'outra');
  await expect(page.locator('.var-row .error-text').first()).toContainText('únicas');
  await page.getByTestId('save-variables').click();
  await expect(page.getByTestId('notice')).toHaveCount(0);
  expect(await storedVariables(page)).toEqual([]);
});

test('c-f) variável no valor do campo: preview, preenchimento, edição e exclusão em uso', async ({
  context,
  extensionId,
  page: harness,
}) => {
  const page = await openOptions(context, extensionId);
  await goVariables(page);
  await addVariable(page, 'codigo_teste', 'ABC123');
  await saveVariables(page);

  await test.step('c) preview ao vivo e preenchimento', async () => {
    await editE2eRule(page);
    const card = page.locator('[data-field-id="nbs"]');
    // sem {{ }} não há linha de resultado
    await expect(card.getByTestId('value-preview')).toHaveCount(0);
    await card.locator('.f-value').fill('{{ var.codigo_teste }}');
    await expect(card.getByTestId('value-preview')).toHaveText('Resultado: ABC123');
    // variável inexistente: aviso, mas não bloqueia
    await card.locator('.f-value').fill('{{ var.nao_existe }}');
    await expect(card.getByTestId('value-preview')).toContainText('não foi possível resolver');
    // o campo "interno" usa url.query.ref com padrão
    await expect(page.locator('[data-field-id="interno"]').getByTestId('value-preview')).toHaveText(
      'Resultado: sem-ref',
    );
    // sugestões de autocomplete
    await expect(
      page.locator('#value-suggestions option[value="{{ var.codigo_teste }}"]'),
    ).toHaveCount(1);
    await card.locator('.f-value').fill('{{ var.codigo_teste }}');
    await page.getByTestId('save-rule').click();
    await expect(page.getByTestId('notice')).toHaveText('Regra salva');

    await harness.goto(`${baseURL}/`);
    await openModal(harness);
    await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('ABC123');
  });

  await test.step('d) alterar a variável vale sem recarregar a página', async () => {
    await goVariables(page);
    await expect(varRow(page, 'codigo_teste')).toContainText(E2E_NAME);
    await varRow(page, 'codigo_teste').locator('.v-value').fill('XYZ789');
    await saveVariables(page);
    await harness.waitForTimeout(500);
    await reopenModal(harness);
    await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('XYZ789');
  });

  await test.step('e) excluir variável em uso avisa e, confirmada, deixa o campo sem valor', async () => {
    await goVariables(page);
    await varRow(page, 'codigo_teste').locator('.v-remove').click();
    const warning = page.getByTestId('delete-warning');
    await expect(warning).toContainText(E2E_NAME);
    // cancelar mantém
    await page.getByTestId('cancel-delete').click();
    await expect(warning).toHaveCount(0);
    expect((await storedVariables(page)).map((v) => v.key)).toEqual(['codigo_teste']);

    await varRow(page, 'codigo_teste').locator('.v-remove').click();
    await expect(warning).toContainText(E2E_NAME);
    await page.getByTestId('confirm-delete').click();
    await expect(page.getByTestId('notice')).toHaveText('Variáveis salvas');
    expect(await storedVariables(page)).toEqual([]);
    await expect(page.locator('.var-row')).toHaveCount(0);

    await harness.waitForTimeout(500);
    await reopenModal(harness);
    await expect(harness.locator(`${TOAST} li.skipped-unresolved-value`).first()).toContainText(
      'valor não resolvido',
    );
    await harness.waitForTimeout(500);
    expect(await nbs(harness)).toBe('');
  });

  await test.step('f) restaura o valor original do NBS', async () => {
    await setNbsValue(page, '126029000');
    await harness.waitForTimeout(500);
    await reopenModal(harness);
    await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('126029000');
  });
});

test('g) variável "Só neste navegador": valor só no storage.local, preenche e vira ausente em outro navegador', async ({
  context,
  extensionId,
  page: harness,
}) => {
  const page = await openOptions(context, extensionId);
  await goVariables(page);
  await addVariable(page, 'segredo_teste', 'LOCAL42', 'Segredo');
  await varRow(page, 'segredo_teste').getByTestId('var-scope').selectOption('local');
  await saveVariables(page);

  await test.step('sync só tem a chave; o valor está no local', async () => {
    expect(await storedVariables(page)).toEqual([
      { key: 'segredo_teste', label: 'Segredo', value: '', scope: 'local' },
    ]);
    const local = await page.evaluate(() => chrome.storage.local.get('vars:local'));
    expect(local['vars:local']).toEqual({ segredo_teste: 'LOCAL42' });
    expect(JSON.stringify(await readSync(page))).not.toContain('LOCAL42');
    await expect(varRow(page, 'segredo_teste').getByTestId('var-no-value')).toHaveCount(0);
  });

  await test.step('o preenchimento usa o valor local', async () => {
    await editE2eRule(page);
    const card = page.locator('[data-field-id="nbs"]');
    await card.locator('.f-value').fill('{{ var.segredo_teste | default("padrao") }}');
    await page.getByTestId('save-rule').click();
    await expect(page.getByTestId('notice')).toHaveText('Regra salva');
    await harness.goto(`${baseURL}/`);
    await openModal(harness);
    await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('LOCAL42');
  });

  await test.step('"outro navegador": sem valor local, aparece como sem valor e default() assume', async () => {
    await page.evaluate(() => chrome.storage.local.clear());
    await goVariables(page);
    await expect(varRow(page, 'segredo_teste').getByTestId('var-no-value')).toHaveText(
      'sem valor neste navegador',
    );
    await harness.waitForTimeout(500);
    await reopenModal(harness);
    await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('padrao');
  });

  await test.step('restaura o valor original do NBS', async () => {
    await setNbsValue(page, '126029000');
    await harness.waitForTimeout(500);
    await reopenModal(harness);
    await expect.poll(() => nbs(harness), { timeout: 4000 }).toBe('126029000');
  });
});
