import { describe, expect, it } from 'vitest';
import type { Capture } from '../../../src/core/locator';
import { parseRule, type Rule } from '../../../src/core/model';
import {
  RECORDING_DRAFT_KEY,
  RECORDING_DRAFT_MAX_AGE_MS,
  type RecordedField,
  type RecordingGroup,
} from '../../../src/core/recorder/types';
import { parseTemplate } from '../../../src/core/expressions/parser';
import {
  consumeRecordingDraft,
  escapeTemplate,
  findMatchingRulesForGroup,
  groupIntoRule,
  groupToNewRule,
} from '../../../src/entrypoints/options/composables/recording';
import type { PickerStorageArea } from '../../../src/entrypoints/options/composables/picker';

const TITLE = 'Cadastro de Cliente';

const capture = (label: string, over: Partial<Capture> = {}): Capture => ({
  locator: { by: 'label', text: label },
  adapter: 'native-text',
  currentValue: null,
  label,
  container: { selector: '.modal.is-active', textContains: TITLE },
  urlPattern: 'https://app.exemplo.com/*',
  ...over,
});

const field = (label: string, value: string, over: Partial<Capture> = {}): RecordedField => ({
  capture: capture(label, over),
  value,
  url: 'https://app.exemplo.com/cadastro',
  recordedAt: 1,
});

const group = (over: Partial<RecordingGroup> = {}): RecordingGroup => ({
  urlPattern: 'https://app.exemplo.com/*',
  container: { selector: '.modal.is-active', textContains: TITLE },
  fields: [field('Nome', 'Maria Teste'), field('Cidade', 'Cidade Fictícia')],
  ...over,
});

function existingRule(): Rule {
  const r = parseRule({
    id: 'regra-a',
    name: 'Regra A',
    trigger: {
      urlPatterns: ['https://app.exemplo.com/*'],
      container: { selector: '.modal.is-active', textContains: TITLE },
    },
    fields: [
      { id: 'f1', locator: { by: 'label', text: 'Nome' }, value: 'Antigo' },
      { id: 'f2', locator: { by: 'label', text: 'Telefone' }, value: '123' },
    ],
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

function area(
  initial: Record<string, unknown>,
): PickerStorageArea & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: (k) => Promise.resolve(k in data ? { [k]: data[k] } : {}),
    remove: (k) => {
      delete data[k];
      return Promise.resolve();
    },
  };
}

describe('consumeRecordingDraft', () => {
  const draft = { createdAt: 1_000_000, groups: [group()] };

  it('lê, valida e apaga a chave', async () => {
    const a = area({ [RECORDING_DRAFT_KEY]: draft });
    const out = await consumeRecordingDraft(a, 1_000_500);
    expect(out?.groups[0]?.fields).toHaveLength(2);
    expect(RECORDING_DRAFT_KEY in a.data).toBe(false);
  });

  it('descarta rascunho velho, inválido ou ausente (e apaga o que existir)', async () => {
    const old = area({ [RECORDING_DRAFT_KEY]: draft });
    expect(await consumeRecordingDraft(old, 1_000_000 + RECORDING_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(RECORDING_DRAFT_KEY in old.data).toBe(false);
    const bad = area({ [RECORDING_DRAFT_KEY]: { createdAt: 1, groups: 'x' } });
    expect(await consumeRecordingDraft(bad, 2)).toBeNull();
    expect(await consumeRecordingDraft(area({}), 2)).toBeNull();
  });
});

describe('groupToNewRule', () => {
  it('monta nome, URL, contêiner e um campo por valor gravado', () => {
    const d = groupToNewRule(group());
    expect(d.isNew).toBe(true);
    expect(d.name).toBe(TITLE);
    expect(d.urlPatterns).toEqual(['https://app.exemplo.com/*']);
    expect(d.containerSelector).toBe('.modal.is-active');
    expect(d.containerText).toBe(TITLE);
    expect(d.fields.map((f) => [f.locatorBy, f.locatorValue, f.value, f.adapter])).toEqual([
      ['label', 'Nome', 'Maria Teste', 'native-text'],
      ['label', 'Cidade', 'Cidade Fictícia', 'native-text'],
    ]);
    expect(new Set(d.fields.map((f) => f.id)).size).toBe(2);
  });

  it('sem contêiner, usa o host no nome', () => {
    const d = groupToNewRule(
      group({ container: undefined, fields: [field('Nome', 'x', { container: undefined })] }),
    );
    expect(d.containerSelector).toBe('');
    expect(d.name).toBe('app.exemplo.com');
  });

  it('escapa {{ do valor gravado para o motor de expressões', () => {
    expect(escapeTemplate('a {{b}} c')).toBe('a \\{{b}} c');
    const d = groupToNewRule(group({ fields: [field('Nome', 'ola {{x}}')] }));
    expect(parseTemplate(d.fields[0]!.value)).toEqual([{ kind: 'text', value: 'ola {{x}}' }]);
  });
});

describe('groupIntoRule', () => {
  it('atualiza o valor de localizadores iguais e acrescenta os novos', () => {
    const d = groupIntoRule(existingRule(), group());
    expect(d.isNew).toBe(false);
    expect(d.fields.map((f) => [f.locatorValue, f.value])).toEqual([
      ['Nome', 'Maria Teste'],
      ['Telefone', '123'],
      ['Cidade', 'Cidade Fictícia'],
    ]);
    expect(d.fields[0]!.id).toBe('f1');
  });
});

describe('findMatchingRulesForGroup', () => {
  it('casa por URL e contêiner', () => {
    const r = existingRule();
    expect(findMatchingRulesForGroup([r], group())).toEqual([r]);
    expect(findMatchingRulesForGroup([r], group({ urlPattern: 'https://outro.com/*' }))).toEqual(
      [],
    );
    expect(findMatchingRulesForGroup([r], group({ container: undefined }))).toEqual([]);
  });
});
