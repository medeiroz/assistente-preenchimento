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
    __escapeCount: number;
    __cancelled: boolean;
  }
}

type Which = 'native-text' | 'vue-multiselect' | 'native-select' | 'native-choice' | 'date';
type Call =
  | { op: 'write'; value: string }
  | { op: 'read' }
  | { op: 'clear' }
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
      const adapters = window.__adapters;
      const { registry } = adapters;
      if (call.op === 'resolve') return { value: registry.resolve(root, 'auto')?.id ?? null };
      const adapter = {
        'native-text': adapters.nativeTextAdapter,
        'vue-multiselect': adapters.vueMultiselectAdapter,
        'native-select': adapters.nativeSelectAdapter,
        'native-choice': adapters.nativeChoiceAdapter,
        date: adapters.dateAdapter,
      }[which];
      try {
        if (call.op === 'write') {
          await adapter.write(root, call.value);
          return { value: adapter.verify(root, call.value) };
        }
        if (call.op === 'clear') {
          await adapter.clear?.(root);
          return { value: adapter.read(root) };
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
/** Nenhum Escape chegou ao document e o diálogo de cancelamento nunca apareceu. */
async function expectNoEscape(page: Page) {
  expect(await page.evaluate(() => window.__escapeCount)).toBe(0);
  expect(await page.evaluate(() => window.__cancelled)).toBe(false);
  await expect(page.locator('.eui-confirm-wrapper')).toHaveCount(0);
  await expect(page.getByText('Deseja cancelar a emissão da nota?')).toBeHidden();
}
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
  await expectNoEscape(page);
});

test('selecionar "Sim" depois de "Não" troca o valor', async ({ page }) => {
  await openModal(page);
  await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Não' });
  await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Sim' });
  expect(((await state(page)).consumo as { id: number }).id).toBe(1);
  await expect(single(page, CONSUMO)).toHaveText('Sim');
  await dropdownClosed(page, CONSUMO);
  await expectNoEscape(page);
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
  await expectNoEscape(page);
});

test('clear do vue-multiselect via botão × (sem Escape, sem diálogo)', async ({ page }) => {
  await openModal(page);
  await run(page, CONSUMO, 'vue-multiselect', { op: 'write', value: 'Sim' });
  const clearBtn = page.locator(
    `.eui-field:has(label.eui-label:text-is("${CONSUMO}")) .multiselect__clear`,
  );
  await expect(clearBtn).toBeVisible();
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'clear' })).toEqual({ value: null });
  expect((await state(page)).consumo).toBeNull();
  await expect(clearBtn).toHaveCount(0);
  await dropdownClosed(page, CONSUMO);
  await expectNoEscape(page);
  // sem valor: no-op
  expect(await run(page, CONSUMO, 'vue-multiselect', { op: 'clear' })).toEqual({ value: null });
});

test('clear do vue-multiselect sem botão: desseleciona a opção atual (sem Escape)', async ({
  page,
}) => {
  await openModal(page);
  const GOV = 'Tipo de operação governamental';
  await run(page, GOV, 'vue-multiselect', { op: 'write', value: 'Operação Beta' });
  expect(((await state(page)).governamental as { id: number }).id).toBe(11);
  expect(await run(page, GOV, 'vue-multiselect', { op: 'clear' })).toEqual({ value: null });
  expect((await state(page)).governamental).toBeNull();
  await dropdownClosed(page, GOV);
  await expectNoEscape(page);
});

test('clear de native-text, native-select, checkbox e date atualizam o estado Vue', async ({
  page,
}) => {
  await openModal(page);
  await run(page, 'Código NBS', 'native-text', { op: 'write', value: '126029000' });
  expect(await run(page, 'Código NBS', 'native-text', { op: 'clear' })).toEqual({ value: '' });
  expect((await state(page)).nbs).toBe('');
  await run(page, 'Distribuidora', 'native-select', { op: 'write', value: 'Luz Teste' });
  expect((await state(page)).distribuidora).not.toBe('');
  await run(page, 'Distribuidora', 'native-select', { op: 'clear' });
  expect((await state(page)).distribuidora).toBe('');
  await run(page, 'Débito automático', 'native-choice', { op: 'write', value: 'Sim' });
  expect((await state(page)).debitoAuto).toBe(true);
  await run(page, 'Débito automático', 'native-choice', { op: 'clear' });
  expect((await state(page)).debitoAuto).toBe(false);
  await run(page, 'Vencimento', 'date', { op: 'write', value: '05/03/2026' });
  expect((await state(page)).vencimento).toBe('2026-03-05');
  await run(page, 'Vencimento', 'date', { op: 'clear' });
  expect((await state(page)).vencimento).toBe('');
  await expectNoEscape(page);
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
  await expectNoEscape(page);

  expect(await run(page, 'Nome', 'vue-multiselect', { op: 'write', value: 'Zé Ninguém' })).toEqual({
    error: 'option-not-found',
  });
  expect(((await state(page)).nome as { id: number }).id).toBe(2);
  await dropdownClosed(page, 'Nome');
  await expectNoEscape(page);
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

test.describe('adapters extras no harness ("Outros campos")', () => {
  test('native-select escolhe a distribuidora e o modelo Vue recebe', async ({ page }) => {
    await openModal(page);
    expect(await run(page, 'Distribuidora', 'native-select', { op: 'isDefault' })).toEqual({
      value: true,
    });
    expect(
      await run(page, 'Distribuidora', 'native-select', { op: 'write', value: 'Luz Teste' }),
    ).toEqual({ value: true });
    expect((await state(page)).distribuidora).toBe('Luz Teste');
    expect(await run(page, 'Distribuidora', 'native-select', { op: 'read' })).toEqual({
      value: 'Luz Teste',
    });
    const before = await state(page);
    expect(
      await run(page, 'Distribuidora', 'native-select', { op: 'write', value: 'Inexistente' }),
    ).toEqual({ error: 'option-not-found' });
    expect(await state(page)).toEqual(before);
    await expectNoEscape(page);
  });

  test('native-choice: radios, checkbox e toggle atualizam o estado Vue', async ({ page }) => {
    await openModal(page);
    expect(await run(page, 'Tipo de conta', 'native-choice', { op: 'isDefault' })).toEqual({
      value: true,
    });
    expect(
      await run(page, 'Tipo de conta', 'native-choice', { op: 'write', value: 'Comercial' }),
    ).toEqual({ value: true });
    expect((await state(page)).tipoConta).toBe('comercial');

    expect(
      await run(page, 'Débito automático', 'native-choice', { op: 'write', value: 'Sim' }),
    ).toEqual({ value: true });
    expect((await state(page)).debitoAuto).toBe(true);
    expect(
      await run(page, 'Débito automático', 'native-choice', { op: 'write', value: 'quem sabe' }),
    ).toEqual({ error: 'write-failed' });
    expect((await state(page)).debitoAuto).toBe(true);
    await run(page, 'Débito automático', 'native-choice', { op: 'write', value: 'off' });
    expect((await state(page)).debitoAuto).toBe(false);

    expect(await run(page, 'Tipo de pessoa', 'native-choice', { op: 'read' })).toEqual({
      value: 'Física',
    });
    expect(
      await run(page, 'Tipo de pessoa', 'native-choice', { op: 'write', value: 'Jurídica' }),
    ).toEqual({ value: true });
    expect((await state(page)).tipoPessoa).toBe('Jurídica');
    await expect(
      page.locator('.eui-field:has(label:text-is("Tipo de pessoa")) button.is-filled'),
    ).toHaveText('Jurídica');
    await expectNoEscape(page);
  });

  test('date escreve em type=date e no datepicker de texto', async ({ page }) => {
    await openModal(page);
    expect(await run(page, 'Vencimento', 'date', { op: 'write', value: '15/08/2026' })).toEqual({
      value: true,
    });
    expect((await state(page)).vencimento).toBe('2026-08-15');
    expect(await run(page, 'Vencimento', 'date', { op: 'read' })).toEqual({ value: '15/08/2026' });

    expect(
      await run(page, 'Data de competência', 'date', { op: 'write', value: '2026-01-31' }),
    ).toEqual({ value: true });
    expect((await state(page)).competencia).toBe('31/01/2026');
    expect(await run(page, 'Data de competência', 'date', { op: 'isDefault' })).toEqual({
      value: false,
    });
    expect(
      await run(page, 'Data de competência', 'date', { op: 'write', value: '31/02/2026' }),
    ).toEqual({ error: 'write-failed' });
    expect((await state(page)).competencia).toBe('31/01/2026');
    await expectNoEscape(page);
  });

  test('registry auto resolve os campos extras', async ({ page }) => {
    await openModal(page);
    const expected: [string, Which][] = [
      ['Distribuidora', 'native-select'],
      ['Tipo de conta', 'native-choice'],
      ['Débito automático', 'native-choice'],
      ['Tipo de pessoa', 'native-choice'],
      ['Vencimento', 'date'],
      ['Data de competência', 'date'],
      ['Código NBS', 'native-text'],
    ];
    for (const [label, id] of expected) {
      expect(await run(page, label, id, { op: 'resolve' })).toEqual({ value: id });
    }
  });
});
