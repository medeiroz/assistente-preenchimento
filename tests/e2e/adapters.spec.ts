import { test, expect, type Page } from '@playwright/test';
import { start, stop } from './harness-server';
import { bundleAdapters } from './bundle';

declare global {
  interface Window {
    __harness: {
      getState(): Record<string, unknown>;
      open(preset?: unknown): void;
      close(): void;
      hideViaClass(): void;
    };
  }
}

type Which = 'native-text' | 'vue-multiselect';
type Call =
  | { op: 'write'; value: string }
  | { op: 'read' }
  | { op: 'isDefault'; defaultValue?: string }
  | { op: 'resolve' };

let baseURL = '';
let bundle = '';
test.beforeAll(async () => {
  baseURL = await start();
  bundle = await bundleAdapters();
});
test.afterAll(async () => {
  await stop();
});

const state = (page: Page) => page.evaluate(() => window.__harness.getState());

async function openModal(page: Page, query = '') {
  await page.goto(`${baseURL}/${query}`);
  await page.click('#open-nfse');
  await expect(page.locator('.eui-modal-title')).toBeVisible();
  await page.addScriptTag({ content: bundle });
}

/** Chama o adaptador dentro da página; erros voltam como { error: code }. */
function run(page: Page, label: string, which: Which, call: Call) {
  return page.evaluate(
    async ({ label, which, call }) => {
      const found = Array.from(document.querySelectorAll('label.eui-label')).find(
        (l) => l.textContent?.trim() === label,
      );
      const root = found?.closest('.eui-field');
      if (!root) throw new Error(`campo não encontrado: ${label}`);
      const { registry, nativeTextAdapter, vueMultiselectAdapter } = window.__adapters;
      if (call.op === 'resolve') return { value: registry.resolve(root, 'auto')?.id ?? null };
      const adapter = which === 'native-text' ? nativeTextAdapter : vueMultiselectAdapter;
      try {
        if (call.op === 'write') {
          await adapter.write(root, call.value);
          return { value: adapter.verify(root, call.value) };
        }
        if (call.op === 'read') return { value: adapter.read(root) };
        return { value: adapter.isDefault(root, call.defaultValue) };
      } catch (e) {
        const err = e as { name?: string; code?: string };
        return { error: err.name === 'AdapterError' ? err.code : String(e) };
      }
    },
    { label, which, call },
  );
}

const CONSUMO = 'Operação de uso ou consumo pessoal';
const dropdownClosed = async (page: Page, label: string) =>
  expect(
    page.locator(`.eui-field:has(label.eui-label:text-is("${label}")) .multiselect--active`),
  ).toHaveCount(0);
const single = (page: Page, label: string) =>
  page.locator(`.eui-field:has(label.eui-label:text-is("${label}")) .multiselect__single`);

test('native-text escreve no Código NBS e o modelo Vue recebe', async ({ page }) => {
  await openModal(page);
  expect(await run(page, 'Código NBS', 'native-text', { op: 'write', value: '126029000' })).toEqual(
    { value: true },
  );
  expect((await state(page)).nbs).toBe('126029000');
});

test('vue-multiselect seleciona "Não" e fecha o dropdown', async ({ page }) => {
  await openModal(page);
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Não' })).toEqual({
    value: true,
  });
  expect(((await state(page)).consumo as { id: number }).id).toBe(0);
  await expect(single(page, CONSUMO)).toHaveText('Não');
  await dropdownClosed(page, CONSUMO);
});

test('selecionar "Sim" depois de "Não" troca o valor', async ({ page }) => {
  await openModal(page);
  await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Não' });
  await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Sim' });
  expect(((await state(page)).consumo as { id: number }).id).toBe(1);
  await expect(single(page, CONSUMO)).toHaveText('Sim');
  await dropdownClosed(page, CONSUMO);
});

test('opção inexistente lança option-not-found e não altera o estado', async ({ page }) => {
  await openModal(page);
  await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Não' });
  const before = await state(page);
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Talvez' })).toEqual({
    error: 'option-not-found',
  });
  expect(await state(page)).toEqual(before);
  await dropdownClosed(page, CONSUMO);
});

test('select pesquisável "Nome" seleciona nome existente e rejeita inexistente', async ({
  page,
}) => {
  await openModal(page);
  expect(await run(page, 'Nome', 'vue-multiselect', { op: 'write', value: 'Bruno Teste' })).toEqual(
    { value: true },
  );
  expect(((await state(page)).nome as { id: number }).id).toBe(2);
  await expect(single(page, 'Nome')).toHaveText('Bruno Teste');
  await dropdownClosed(page, 'Nome');

  expect(await run(page, 'Nome', 'vue-multiselect', { op: 'write', value: 'Zé Ninguém' })).toEqual({
    error: 'option-not-found',
  });
  expect(((await state(page)).nome as { id: number }).id).toBe(2);
  await dropdownClosed(page, 'Nome');
});

test('isDefault: true no modal vazio', async ({ page }) => {
  await openModal(page);
  expect(await run(page, 'Código NBS', 'native-text', { op: 'isDefault' })).toEqual({
    value: true,
  });
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'isDefault' })).toEqual({
    value: true,
  });
  expect(await run(page, 'Nome', 'vue-multiselect', { op: 'isDefault' })).toEqual({ value: true });
});

test('isDefault: false com preset=loaded', async ({ page }) => {
  await openModal(page, '?preset=loaded');
  expect(await run(page, 'Código NBS', 'native-text', { op: 'isDefault' })).toEqual({
    value: false,
  });
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'isDefault' })).toEqual({
    value: false,
  });
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'read' })).toEqual({ value: 'Sim' });
  expect(
    await run(page, CONSUMO, 'vue-multiselect', { op: 'isDefault', defaultValue: 'Sim' }),
  ).toEqual({ value: true });
});

test('registry.resolve("auto") escolhe o adaptador certo por campo', async ({ page }) => {
  await openModal(page);
  const expected: [string, Which][] = [
    ['Descrição', 'native-text'],
    ['Código NBS', 'native-text'],
    [CONSUMO, 'vue-multiselect'],
    ['Tipo de operação governamental', 'vue-multiselect'],
    ['Nome', 'vue-multiselect'],
  ];
  for (const [label, id] of expected) {
    expect(await run(page, label, id, { op: 'resolve' })).toEqual({ value: id });
  }
});
