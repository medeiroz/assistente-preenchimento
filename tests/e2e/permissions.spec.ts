import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { start, stop } from './harness-server';

interface ScriptingApi {
  getRegisteredContentScripts(): Promise<{ id: string; matches?: string[] }[]>;
}
declare const chrome: { scripting: ScriptingApi };

const SITE = 'https://exemplo-sem-permissao.test/*';
const HOST = 'exemplo-sem-permissao.test';
const TOAST = '[data-assistente-preenchimento]';

let baseURL = '';
test.beforeAll(async () => {
  baseURL = await start();
});
test.afterAll(async () => {
  await stop();
});

// `?e2eDenyPermissions=1` (só no build e2e) faz o pedido de permissão resolver false: o prompt
// nativo do Chrome não é automatizável.
async function openOptions(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/options.html?e2eDenyPermissions=1`);
  await expect(page.locator('[data-rule-id="e2e-harness"]')).toBeVisible();
}

async function createRule(page: Page, name: string, pattern: string): Promise<void> {
  await page.getByTestId('new-rule').click();
  await page.locator('#rule-name').fill(name);
  await page.locator('.url-pattern').first().fill(pattern);
  await page.getByTestId('add-field').click();
  await page.locator('[data-field-id="campo-1"] .f-locator').fill('Nome');
  await page.locator('[data-field-id="campo-1"] .f-value').fill('Fulano');
}

test('a) regra de site novo: salva, avisa que falta permissão e mostra o selo', async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  await createRule(page, 'Site sem permissão', SITE);
  await expect(page.getByTestId('info-permission')).toContainText(HOST);
  await page.getByTestId('save-rule').click();

  await expect(page.getByTestId('notice')).toHaveText('Regra salva');
  const denied = page.getByTestId('perm-denied');
  await expect(denied).toBeVisible();
  await expect(denied).toContainText(`Sem permissão para ${HOST}`);
  await expect(denied).toContainText('a regra fica salva, mas só funciona depois');
  await expect(denied.getByRole('button', { name: 'Permitir acesso' })).toBeVisible();

  const item = page.locator('.rule-item', { hasText: 'Site sem permissão' });
  await expect(item.getByTestId('no-permission')).toContainText('sem permissão');
  // Regras cobertas estaticamente (CE e harness e2e) não ganham o selo.
  await expect(
    page.locator('[data-rule-id="e2e-harness"] [data-testid="no-permission"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId('no-permission')).toHaveCount(1);

  // Novo gesto: o botão pede de novo (no e2e continua negado).
  await denied.getByRole('button', { name: 'Permitir acesso' }).click();
  await expect(page.getByTestId('perm-denied')).toBeVisible();
});

test('avisos do editor: http não suportado e padrão amplo demais', async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  await page.getByTestId('new-rule').click();
  await page.locator('.url-pattern').first().fill('http://site-http.test/*');
  await expect(page.getByTestId('warn-http')).toContainText('Sites sem HTTPS não são suportados');
  await page.locator('.url-pattern').first().fill('https://*/*');
  await expect(page.getByTestId('warn-broad')).toContainText('site específico');
  await expect(page.getByTestId('warn-http')).toHaveCount(0);
  await expect(page.getByTestId('info-permission')).toHaveCount(0);
});

test('b) regra e2e (localhost) é coberta estaticamente: sem selo e sem registro dinâmico', async ({
  page,
  extensionId,
}) => {
  await openOptions(page, extensionId);
  await expect(page.getByTestId('no-permission')).toHaveCount(0);
  // dá tempo ao background de sincronizar após o seed
  await page.waitForTimeout(1000);
  const registered = await page.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  expect(registered).toEqual([]);

  // negado: criar regra de site novo também não registra nada
  await createRule(page, 'Outra sem permissão', 'https://outro-sem-permissao.test/*');
  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('notice')).toHaveText('Regra salva');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
});

test('c) preenchimento no harness segue funcionando, sem injeção dupla', async ({
  context,
  extensionId,
}) => {
  const ext = await context.newPage();
  await openOptions(ext, extensionId);
  await ext.close();

  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
  await expect(page.locator(`${TOAST} .summary`)).toContainText(/[23] preenchidos/, {
    timeout: 5000,
  });
  await expect(page.locator(TOAST)).toHaveCount(1);
});
