import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

interface ChromeLocal {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
}
declare const chrome: ChromeLocal;

const LONG_PATH =
  '/vendas/relatorio-de-vendas-mensal-consolidado-por-regiao-e-por-vendedor/2026/11';

const reports = [
  {
    ruleId: 'r1',
    ruleName: 'Regra de exemplo',
    startedAt: '2026-11-10T12:30:00.000Z',
    url: `https://app.exemplo.test${LONG_PATH}?q=1`,
    origin: 'manual',
    fields: [
      { fieldId: 'a', description: 'Campo A', outcome: 'filled', previousValue: '', newValue: '1' },
      { fieldId: 'b', description: 'Campo B', outcome: 'filled', previousValue: '', newValue: '2' },
      { fieldId: 'c', description: 'Campo C', outcome: 'undone', previousValue: null },
    ],
  },
  {
    ruleId: 'r2',
    ruleName: 'Outra regra com um nome razoavelmente comprido para quebrar linha',
    startedAt: '2026-11-09T09:00:00.000Z',
    url: 'https://loja.exemplo.test/pedidos',
    origin: 'auto',
    fields: [
      { fieldId: 'a', description: 'Campo X', outcome: 'not-found', previousValue: null },
      {
        fieldId: 'b',
        description: 'Campo Y',
        outcome: 'error',
        previousValue: null,
        message: 'falhou',
      },
    ],
  },
  {
    ruleId: 'r3',
    ruleName: 'Terceira',
    startedAt: '2026-11-08T09:00:00.000Z',
    url: 'https://exemplo.test/',
    origin: 'auto',
    fields: [],
  },
];

async function openHistory(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.evaluate((r) => chrome.storage.local.set({ history: r }), reports);
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.locator('.history-item')).toHaveCount(reports.length);
}

for (const width of [360, 1000, 1400]) {
  test(`histórico: URL e resumo não se sobrepõem (${width}px)`, async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    await openHistory(page, extensionId);
    const items = page.locator('.history-item');
    for (let i = 0; i < reports.length; i++) {
      const it = items.nth(i);
      const head = (await it.locator('.h-head').boundingBox())!;
      const url = (await it.getByTestId('history-url').boundingBox())!;
      const sum = (await it.getByTestId('history-summary').boundingBox())!;
      expect(url.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
      expect(sum.y).toBeGreaterThanOrEqual(url.y + url.height - 1);
      await expect(it.getByTestId('history-summary')).toBeVisible();
    }
    await expect(items.first().getByTestId('history-summary')).toContainText('2 preenchidos');
    await page.close();
  });
}
