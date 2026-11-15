import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

interface ChromeArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
declare const chrome: { storage: { sync: ChromeArea } };

const E2E_ID = 'e2e-harness';

const readSync = (page: Page) =>
  page.evaluate(() => chrome.storage.sync.get(null) as Promise<Record<string, unknown>>);

test('configuração de versão mais nova: aviso fixo e escritas desabilitadas', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // O seed é gravado pelo background; espera pelas regras antes de marcar a versão futura.
  await expect(page.locator(`[data-rule-id="${E2E_ID}"]`)).toBeVisible();
  await expect(page.getByTestId('read-only-warning')).toHaveCount(0);

  await page.evaluate(async () => {
    const got = await chrome.storage.sync.get('cfg:meta');
    const meta = got['cfg:meta'] as Record<string, unknown>;
    await chrome.storage.sync.set({ 'cfg:meta': { ...meta, schemaVersion: 2, futuro: 'x' } });
  });
  await page.reload();

  // As regras válidas continuam visíveis, mas nada pode ser alterado.
  await expect(page.locator(`[data-rule-id="${E2E_ID}"]`)).toBeVisible();
  await expect(page.getByTestId('read-only-warning')).toHaveText(
    'Esta configuração foi salva por uma versão mais nova da extensão. Atualize a extensão para editar.',
  );
  await expect(page.getByTestId('new-rule')).toBeDisabled();
  await expect(
    page.locator(`[data-rule-id="${E2E_ID}"]`).locator('[data-action="remove"]'),
  ).toBeDisabled();
  await expect(
    page.locator(`[data-rule-id="${E2E_ID}"]`).locator('[data-action="duplicate"]'),
  ).toBeDisabled();

  // O editor abre para consulta, mas salvar fica desabilitado.
  await page.locator(`[data-rule-id="${E2E_ID}"]`).locator('[data-action="edit"]').click();
  await expect(page.getByTestId('save-rule')).toBeDisabled();
  await page.getByTestId('cancel-edit').click();

  await page.getByRole('tab', { name: 'Variáveis' }).click();
  await expect(page.getByTestId('save-variables')).toBeDisabled();
  await expect(page.getByTestId('add-variable')).toBeDisabled();

  await page.getByRole('tab', { name: 'Importar/Exportar' }).click();
  await expect(page.getByTestId('import-file')).toBeDisabled();
  await expect(page.getByTestId('add-file')).toBeDisabled();

  // Nada foi gravado: o índice continua como a versão futura o deixou.
  const all = await readSync(page);
  expect(all['cfg:meta']).toMatchObject({ schemaVersion: 2, futuro: 'x' });
});
