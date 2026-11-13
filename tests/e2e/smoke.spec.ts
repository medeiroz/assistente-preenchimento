import { test, expect } from './fixtures';

test('service worker carrega e options mostra o título', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  expect(context.serviceWorkers().length).toBeGreaterThan(0);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.locator('h1')).toHaveText('Configurações');
});
