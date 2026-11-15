import { test, expect } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { start, stop } from './harness-server';

type ChromeApi = {
  chrome: {
    tabs: { query(q: { url?: string }): Promise<{ id?: number }[]> };
    runtime: { sendMessage(message: unknown): Promise<unknown> };
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

test('grava um wizard com navegação completa e troca de passo (SPA)', async ({
  context,
  extensionId,
}: {
  context: BrowserContext;
  extensionId: string;
}) => {
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

  const page: Page = await context.newPage();
  await page.goto(`${baseURL}/wizard/step1.html`);
  const tabId = await ext.evaluate(async (u) => {
    const tabs = await (globalThis as unknown as ChromeApi).chrome.tabs.query({ url: u });
    return tabs[0]?.id ?? -1;
  }, `${baseURL}/wizard/*`);
  expect(tabId).toBeGreaterThan(-1);

  // Mesma mensagem que o popup envia ao clicar em "Gravar preenchimento".
  await ext.evaluate(
    (id) =>
      (globalThis as unknown as ChromeApi).chrome.runtime.sendMessage({
        type: 'recorder/start',
        payload: { tabId: id },
      }),
    tabId,
  );
  const stopButton = page.getByRole('button', { name: 'Parar e criar regras' });
  await expect(stopButton).toBeVisible();

  // Passo 1: digitação real; "Próximo" logo depois do último campo (navegação completa).
  await page.locator('#nome').pressSequentially('Maria Exemplo');
  await page.locator('#cidade').pressSequentially('Cidade Exemplo');
  await page.locator('#senha').pressSequentially('segredo-123');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.waitForURL(/step2\.html/);

  // Passo 2: a barra volta sozinha depois da navegação (script estático + sessão no background).
  await expect(stopButton).toBeVisible();
  // selectOption dispara eventos sintéticos (não confiáveis); o teclado gera os reais.
  await page.locator('#plano').focus();
  await page.keyboard.type('Pre');
  await page.keyboard.press('Enter');
  await expect(page.locator('#plano')).toHaveValue('premium');
  await page.locator('#contato').check();
  await page.locator('#obs').pressSequentially('Prefere contato à tarde');
  // Datepicker: o calendário fica fora do campo e o valor é definido por script (change sintético).
  await page.locator('#inicio').click();
  await page.locator('#calendario .dia', { hasText: /^15$/ }).click();
  await expect(page.locator('#inicio')).toHaveValue('15/03/2026');
  await page.getByRole('button', { name: 'Próximo' }).click();

  // Passo 3 (SPA): o DOM é trocado sem recarregar.
  await expect(page.locator('#telefone')).toBeVisible();
  await expect(page).toHaveURL(/step3\.html/);
  await page.locator('#telefone').pressSequentially('11 99999-0000');
  await page.locator('#bairro').pressSequentially('Centro');

  const opened = context.waitForEvent('page');
  await stopButton.click();
  const options = await opened;
  await options.waitForLoadState();

  // Os campos gravados aparecem no painel de revisão ou direto no editor.
  const text = async (): Promise<string> =>
    (await options.locator('body').innerText()) +
    '\n' +
    (await options
      .locator('input, textarea, select')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join('\n')));
  await expect.poll(text).toContain('Nome completo');
  const all = await text();
  for (const expected of [
    'Maria Exemplo',
    'Cidade Exemplo',
    'Plano',
    'Premium',
    'Aceita contato',
    'Observações',
    'Prefere contato à tarde',
    'Data de início',
    '15/03/2026',
    'Telefone de contato',
    '11 99999-0000',
    'Bairro',
    'Centro',
  ]) {
    expect(all, expected).toContain(expected);
  }
  expect(all).not.toContain('segredo-123');
  expect(all).not.toContain('Senha de acesso');
});
