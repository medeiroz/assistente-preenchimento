import { describe, expect, it } from 'vitest';
import { PICKER_DRAFT_KEY, type Capture } from '../../../src/core/locator';
import { parseRule, type Rule } from '../../../src/core/model';
import {
  draftToRuleInput,
  validateDraft,
} from '../../../src/entrypoints/options/composables/draft';
import {
  PICKER_DRAFT_MAX_AGE_MS,
  addCaptureToRule,
  captureToFieldDraft,
  consumePickerDraft,
  findMatchingRules,
  newRuleFromCapture,
  suggestRuleName,
  valueHint,
  type PickerStorageArea,
} from '../../../src/entrypoints/options/composables/picker';

const TITLE = 'Emitir Nota Fiscal de Serviços Eletrônica';

const capture = (over: Partial<Capture> = {}): Capture => ({
  locator: { by: 'label', text: 'Descrição' },
  adapter: 'native-text',
  currentValue: 'texto da página',
  label: 'Descrição',
  container: { selector: '.eui-modal-wrapper.is-active', textContains: TITLE },
  urlPattern: 'http://127.0.0.1/*',
  ...over,
});

function rule(over: Record<string, unknown> = {}): Rule {
  const r = parseRule({
    id: 'regra-a',
    name: 'Regra A',
    trigger: {
      urlPatterns: ['http://localhost/*', 'http://127.0.0.1/*'],
      container: { selector: '.eui-modal-wrapper.is-active', textContains: TITLE },
    },
    fields: [
      {
        id: 'nbs',
        locator: { by: 'label', text: 'Código NBS' },
        value: '1',
      },
    ],
    updatedAt: '2026-11-13T00:00:00.000Z',
    ...over,
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

describe('findMatchingRules', () => {
  it('casa urlPattern incluído + mesmo container (selector e texto)', () => {
    expect(findMatchingRules([rule()], capture()).map((r) => r.id)).toEqual(['regra-a']);
  });

  it('não casa com outro host, outro seletor ou outro texto', () => {
    const rules = [rule()];
    expect(findMatchingRules(rules, capture({ urlPattern: 'http://outro.com/*' }))).toEqual([]);
    expect(
      findMatchingRules(rules, capture({ container: { selector: '.modal.is-active' } })),
    ).toEqual([]);
    expect(
      findMatchingRules(
        rules,
        capture({ container: { selector: '.eui-modal-wrapper.is-active', textContains: 'Outro' } }),
      ),
    ).toEqual([]);
  });

  it('sem container nos dois lados também casa; só de um lado, não', () => {
    const noContainer = rule({ trigger: { urlPatterns: ['http://127.0.0.1/*'] } });
    expect(findMatchingRules([noContainer], capture({ container: undefined }))).toHaveLength(1);
    expect(findMatchingRules([noContainer], capture())).toEqual([]);
    expect(findMatchingRules([rule()], capture({ container: undefined }))).toEqual([]);
  });

  it('devolve todas as regras que casam', () => {
    const rules = [rule(), rule({ id: 'regra-b', name: 'Regra B' })];
    expect(findMatchingRules(rules, capture())).toHaveLength(2);
  });
});

describe('rascunhos a partir da captura', () => {
  it('suggestRuleName: título do container, senão host, senão padrão', () => {
    expect(suggestRuleName(capture())).toBe(TITLE);
    expect(suggestRuleName(capture({ container: undefined }))).toBe('127.0.0.1');
    expect(suggestRuleName(capture({ container: undefined, urlPattern: '' }))).toBe('Nova regra');
  });

  it('newRuleFromCapture: nome, URL, container e campo com valor vazio', () => {
    const { draft, focus } = newRuleFromCapture(capture());
    expect(draft.isNew).toBe(true);
    expect(draft.name).toBe(TITLE);
    expect(draft.urlPatterns).toEqual(['http://127.0.0.1/*']);
    expect(draft.containerSelector).toBe('.eui-modal-wrapper.is-active');
    expect(draft.containerText).toBe(TITLE);
    expect(draft.fields).toHaveLength(1);
    expect(draft.fields[0]).toMatchObject({
      locatorBy: 'label',
      locatorValue: 'Descrição',
      adapter: 'native-text',
      value: '',
    });
    expect(focus).toEqual({
      fieldId: draft.fields[0]?.id,
      hint: 'valor atual na página: texto da página',
      duplicate: false,
    });
    expect(validateDraft(draft).ok).toBe(true);
  });

  it('captura sem container: campos de container vazios e nome do host', () => {
    const { draft } = newRuleFromCapture(capture({ container: undefined }));
    expect(draft.containerSelector).toBe('');
    expect(draft.containerText).toBe('');
    expect(draft.name).toBe('127.0.0.1');
    expect(draftToRuleInput(draft).trigger).not.toHaveProperty('container');
  });

  it('locators selector e name viram o valor certo', () => {
    expect(
      captureToFieldDraft(capture({ locator: { by: 'selector', css: 'div.x' } }), []),
    ).toMatchObject({ locatorBy: 'selector', locatorValue: 'div.x' });
    expect(captureToFieldDraft(capture({ locator: { by: 'name', name: 'q' } }), [])).toMatchObject({
      locatorBy: 'name',
      locatorValue: 'q',
    });
  });

  it('valueHint: vazio e nulo viram "(vazio)"', () => {
    expect(valueHint(capture({ currentValue: '' }))).toBe('valor atual na página: (vazio)');
    expect(valueHint(capture({ currentValue: null }))).toBe('valor atual na página: (vazio)');
  });

  it('addCaptureToRule: acrescenta o campo novo com id livre', () => {
    const { draft, focus } = addCaptureToRule(rule(), capture());
    expect(draft.isNew).toBe(false);
    expect(draft.id).toBe('regra-a');
    expect(draft.fields.map((f) => f.locatorValue)).toEqual(['Código NBS', 'Descrição']);
    expect(focus.duplicate).toBe(false);
    expect(focus.fieldId).toBe('campo-1');
    expect(draft.fields[1]?.value).toBe('');
  });

  it('addCaptureToRule: campo duplicado não é adicionado e aponta o existente', () => {
    const { draft, focus } = addCaptureToRule(
      rule(),
      capture({ locator: { by: 'label', text: 'código nbs' }, label: 'código nbs' }),
    );
    expect(draft.fields).toHaveLength(1);
    expect(focus).toMatchObject({ fieldId: 'nbs', duplicate: true });
  });

  it('duplicado por selector exige igualdade exata', () => {
    const r = rule({
      fields: [{ id: 'a', locator: { by: 'selector', css: 'div.x' }, value: '' }],
    });
    expect(
      addCaptureToRule(r, capture({ locator: { by: 'selector', css: 'div.x' } })).focus.duplicate,
    ).toBe(true);
    expect(
      addCaptureToRule(r, capture({ locator: { by: 'selector', css: 'div.y' } })).focus.duplicate,
    ).toBe(false);
  });
});

function fakeArea(initial: Record<string, unknown>): PickerStorageArea & {
  data: Record<string, unknown>;
} {
  const data = { ...initial };
  return {
    data,
    get: (key) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    remove: (key) => {
      delete data[key];
      return Promise.resolve();
    },
  };
}

describe('consumePickerDraft', () => {
  const NOW = 1_000_000;

  it('lê e apaga a chave (consumo único)', async () => {
    const area = fakeArea({ [PICKER_DRAFT_KEY]: { capture: capture(), createdAt: NOW - 1000 } });
    const first = await consumePickerDraft(area, NOW);
    expect(first?.capture.label).toBe('Descrição');
    expect(PICKER_DRAFT_KEY in area.data).toBe(false);
    expect(await consumePickerDraft(area, NOW)).toBeNull();
  });

  it('sem rascunho: null', async () => {
    expect(await consumePickerDraft(fakeArea({}), NOW)).toBeNull();
  });

  it('lixo é apagado e ignorado', async () => {
    const area = fakeArea({ [PICKER_DRAFT_KEY]: { capture: { locator: 1 }, createdAt: 'x' } });
    expect(await consumePickerDraft(area, NOW)).toBeNull();
    expect(PICKER_DRAFT_KEY in area.data).toBe(false);
  });

  it('rascunho velho demais é apagado e ignorado', async () => {
    const area = fakeArea({
      [PICKER_DRAFT_KEY]: { capture: capture(), createdAt: NOW - PICKER_DRAFT_MAX_AGE_MS - 1 },
    });
    expect(await consumePickerDraft(area, NOW)).toBeNull();
    expect(PICKER_DRAFT_KEY in area.data).toBe(false);
  });
});

describe('captura dentro de iframe', () => {
  it('a regra nasce com "Atuar também em iframes" e grava frames: all', () => {
    const { draft } = newRuleFromCapture(
      capture({ frames: 'all', urlPattern: 'http://localhost/*' }),
    );
    expect(draft.allFrames).toBe(true);
    expect(draft.urlPatterns).toEqual(['http://localhost/*']);
    draft.name = 'Iframe';
    const input = draftToRuleInput(draft) as { trigger: { frames?: string } };
    expect(input.trigger.frames).toBe('all');
  });

  it('captura do topo não marca iframes e não grava a chave', () => {
    const { draft } = newRuleFromCapture(capture());
    expect(draft.allFrames).toBeUndefined();
    expect((draftToRuleInput(draft) as { trigger: object }).trigger).not.toHaveProperty('frames');
  });

  it('só regras com o mesmo alcance de frames recebem o campo', () => {
    const top = rule();
    const all = rule({
      id: 'regra-iframe',
      trigger: {
        urlPatterns: ['http://127.0.0.1/*'],
        container: { selector: '.eui-modal-wrapper.is-active', textContains: TITLE },
        frames: 'all',
      },
    });
    expect(findMatchingRules([top, all], capture()).map((r) => r.id)).toEqual(['regra-a']);
    expect(findMatchingRules([top, all], capture({ frames: 'all' })).map((r) => r.id)).toEqual([
      'regra-iframe',
    ]);
  });
});
