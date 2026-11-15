import type { BrowserContext, Page } from '@playwright/test';
import { createExtensionTest, expect } from './fixtures';

// Chromium com a interface em inglês (`--lang=en-US`).
const testEn = createExtensionTest('en-US');

interface I18nApi {
  chrome: {
    i18n: { getUILanguage(): string; getMessage(key: string): string };
    runtime: { getManifest(): { name: string } };
  };
}

/**
 * Abre uma página da extensão. No macOS o Chromium não aplica `--lang` ao catálogo do chrome.i18n
 * (só ao renderizador): nesse caso o teste é pulado, e o catálogo `en` fica coberto pelos testes
 * unitários (tests/unit/i18n-en.test.ts). No Linux (CI) o flag vale e o teste roda.
 */
async function openEn(context: BrowserContext, extensionId: string, file: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}`);
  const name = await page.evaluate(() =>
    (globalThis as unknown as I18nApi).chrome.i18n.getMessage('extName'),
  );
  testEn.skip(
    name !== 'Autofill Assistant',
    'Este Chromium ignora --lang no chrome.i18n (comportamento do macOS); o catálogo en é coberto em tests/unit/i18n-en.test.ts',
  );
  return page;
}

testEn(
  'chrome.i18n: idioma e nomes vêm do catálogo em inglês',
  async ({ context, extensionId }) => {
    const page = await openEn(context, extensionId, 'options.html');
    const info = await page.evaluate(() => {
      const c = (globalThis as unknown as I18nApi).chrome;
      return {
        lang: c.i18n.getUILanguage(),
        name: c.i18n.getMessage('extName'),
        manifestName: c.runtime.getManifest().name,
      };
    });
    expect(info.lang.toLowerCase()).toMatch(/^en/);
    expect(info.name).toBe('Autofill Assistant');
    // O manifest guarda o marcador; o Chrome o resolve na interface de extensões.
    expect(info.manifestName).toBe('__MSG_extName__');
  },
);

async function expectNoPortuguese(page: Page): Promise<void> {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/Regras|Variáveis|Histórico|Configurações|Carregando/);
}

testEn('popup em inglês', async ({ context, extensionId }) => {
  const page = await openEn(context, extensionId, 'popup.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Autofill Assistant');
  await expect(page).toHaveTitle('Autofill Assistant');
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  await expectNoPortuguese(page);
});

testEn('Configurações em inglês', async ({ context, extensionId }) => {
  const page = await openEn(context, extensionId, 'options.html');
  await expect(page).toHaveTitle('Settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Autofill Assistant — Settings');
  await expect(page.getByRole('tab')).toHaveText([
    'Rules',
    'Variables',
    'History',
    'Import/Export',
  ]);
  await expect(page.getByTestId('new-rule')).toHaveText('New rule');
  // As mensagens de validação do Zod saem no idioma da hora da validação.
  await page.getByTestId('new-rule').click();
  await page.getByTestId('save-rule').click();
  await expect(page.getByTestId('error-summary')).toContainText('Fix the items below to save:');
  await expect(page.getByTestId('error-summary')).toContainText('the rule name cannot be empty');
  await expectNoPortuguese(page);
});
