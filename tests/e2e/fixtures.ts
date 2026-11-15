import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(import.meta.dirname, '../../.output/chrome-mv3-e2e');

/**
 * Cria o `test` com a extensão carregada num Chromium de perfil temporário. `lang` fixa o idioma
 * da interface do navegador (`--lang`), que escolhe o catálogo do chrome.i18n. O padrão é pt-BR
 * para os testes não dependerem do idioma da máquina (o CI roda em en-US).
 *
 * Limite conhecido: no macOS o Chromium só usa `--lang` no renderizador (getUILanguage); o
 * catálogo de mensagens segue o idioma do sistema. Em Linux/Windows o flag vale para os dois.
 */
export function createExtensionTest(lang = 'pt-BR') {
  return base.extend<{ context: BrowserContext; extensionId: string }>({
    context: async ({}, use) => {
      const userDataDir = await mkdtemp(path.join(tmpdir(), 'pw-ext-'));
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          `--lang=${lang}`,
        ],
      });
      await use(context);
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    },
    extensionId: async ({ context }, use) => {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      await use(new URL(worker.url()).host);
    },
  });
}

export const test = createExtensionTest();

export const expect = test.expect;
