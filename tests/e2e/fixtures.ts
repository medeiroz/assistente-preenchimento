import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(import.meta.dirname, '../../.output/chrome-mv3');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
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

export const expect = test.expect;
