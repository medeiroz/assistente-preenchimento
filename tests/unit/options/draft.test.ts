import { describe, expect, it } from 'vitest';
import { parseRule, type Rule } from '../../../src/core/model';
import {
  ANY_SITE,
  cloneDraft,
  draftToRuleInput,
  duplicateRule,
  fieldCountLabel,
  generateRuleId,
  groupRulesBySite,
  hostOfPattern,
  isDirty,
  moveField,
  newFieldDraft,
  newRuleDraft,
  nextFieldId,
  ruleToDraft,
  siteLabel,
  slugify,
  validateDraft,
} from '../../../src/entrypoints/options/composables/draft';

const NOW = new Date('2026-11-13T12:00:00.000Z');

function makeRule(over: Partial<Rule> = {}): Rule {
  const r = parseRule({
    id: 'regra-a',
    name: 'Regra A',
    trigger: {
      urlPatterns: ['https://app.site.com/*'],
      container: { selector: '.modal', textContains: 'Título' },
      queryParams: { x: '1' },
    },
    fields: [
      {
        id: 'nbs',
        locator: { by: 'label', text: 'Código NBS', exact: true, index: 1 },
        value: '{{ now | date("DD/MM/YYYY") }}',
        defaultValue: '0',
      },
      { id: 'b', locator: { by: 'selector', css: '#b' }, adapter: 'date', value: 'x' },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join(';'));
  return { ...r.rule, ...over };
}

function validNew() {
  const d = newRuleDraft();
  d.name = 'Minha regra';
  d.urlPatterns = ['https://site.com/*'];
  const f = newFieldDraft(d.fields);
  f.locatorValue = 'Nome';
  f.value = 'Fulano';
  d.fields.push(f);
  return d;
}

describe('ids', () => {
  it('slugify remove acentos e símbolos', () => {
    expect(slugify('CE — NFS-e: Emissão Ágil!')).toBe('ce-nfs-e-emissao-agil');
    expect(slugify('   ')).toBe('');
  });

  it('generateRuleId usa slug + sufixo curto e evita colisões', () => {
    const id = generateRuleId('Minha Regra', [], () => 0);
    expect(id).toBe('minha-regra-0000');
    const other = generateRuleId('Minha Regra', [id], () => 0.5);
    expect(other).toMatch(/^minha-regra-[a-z0-9]{4}$/);
    expect(other).not.toBe(id);
  });

  it('generateRuleId com rng fixo colidindo ainda produz id único', () => {
    const taken = ['x-0000'];
    const id = generateRuleId('x', taken, () => 0);
    expect(taken).not.toContain(id);
  });

  it('nome sem letras vira "regra"', () => {
    expect(generateRuleId('!!!', [], () => 0.1)).toMatch(/^regra-/);
  });

  it('nextFieldId gera campo-N único', () => {
    expect(nextFieldId([])).toBe('campo-1');
    expect(nextFieldId([{ id: 'campo-1' }, { id: 'campo-5' }, { id: 'nbs' }])).toBe('campo-6');
    const fields: { id: string }[] = [];
    for (let i = 0; i < 5; i++) fields.push({ id: nextFieldId(fields) });
    expect(new Set(fields.map((f) => f.id)).size).toBe(5);
  });
});

describe('rascunho', () => {
  it('novo rascunho: 1 padrão vazio, auto, onlyIfDefault', () => {
    const d = newRuleDraft();
    expect(d.urlPatterns).toEqual(['']);
    expect(d.mode).toBe('auto');
    expect(d.overwrite).toBe('onlyIfDefault');
    expect(d.isNew).toBe(true);
  });

  it('regra → rascunho → entrada preserva tudo e continua válida', () => {
    const rule = makeRule();
    const draft = ruleToDraft(rule);
    const v = validateDraft(draft, { now: NOW });
    expect(v.ok).toBe(true);
    expect(v.rule).toMatchObject({
      id: 'regra-a',
      name: 'Regra A',
      trigger: {
        urlPatterns: ['https://app.site.com/*'],
        container: { selector: '.modal', textContains: 'Título' },
        queryParams: { x: '1' },
        settleMs: 300,
      },
      fields: [
        { locator: { by: 'label', text: 'Código NBS', exact: true, index: 1 }, defaultValue: '0' },
        { locator: { by: 'selector', css: '#b' }, adapter: 'date' },
      ],
      updatedAt: NOW.toISOString(),
    });
  });

  it('regra nova válida gera id a partir do nome', () => {
    const v = validateDraft(validNew(), { now: NOW, rng: () => 0 });
    expect(v.ok).toBe(true);
    expect(v.rule?.id).toBe('minha-regra-0000');
    expect(v.rule?.fields[0]?.id).toBe('campo-1');
    expect(v.rule?.behavior.overwrite).toBe('onlyIfDefault');
  });

  it('contêiner vazio é omitido; só texto sem seletor é erro', () => {
    const d = validNew();
    expect(draftToRuleInput(d).trigger.container).toBeUndefined();
    d.containerText = 'Título';
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    expect(v.byKey.container).toBeDefined();
  });

  it('defaultValue vazio é omitido', () => {
    const input = draftToRuleInput(validNew());
    expect(input.fields[0]).not.toHaveProperty('defaultValue');
  });

  it('nome vazio e padrão de URL vazio geram erros mapeados', () => {
    const d = newRuleDraft();
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    expect(v.byKey.name).toBeDefined();
    expect(v.byKey['urlPatterns.0']).toBeDefined();
    expect(v.messages.some((m) => m.startsWith('Nome da regra:'))).toBe(true);
    expect(v.messages.some((m) => m.startsWith('Padrão de URL 1:'))).toBe(true);
  });

  it('localizador vazio é marcado no campo certo', () => {
    const d = validNew();
    const f = newFieldDraft(d.fields);
    d.fields.push(f);
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    expect(v.byKey[`fields.${f.id}.locator`]).toBeDefined();
    expect(v.byKey[`fields.${d.fields[0]?.id}.locator`]).toBeUndefined();
  });

  it('expressão inválida bloqueia, com a posição na mensagem', () => {
    const d = validNew();
    const f = d.fields[0];
    if (!f) throw new Error('sem campo');
    f.value = '{{ var. }}';
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    expect(v.byKey[`fields.${f.id}.value`]?.[0]).toMatch(/posição/);
  });

  it('padrão de URL inválido é reprovado', () => {
    const d = validNew();
    d.urlPatterns = ['site.com'];
    expect(validateDraft(d).byKey['urlPatterns.0']).toBeDefined();
  });

  it('espera fora da faixa é reprovada', () => {
    const d = validNew();
    d.settleMs = 99999;
    expect(validateDraft(d).byKey.settleMs).toBeDefined();
  });

  it('isDirty e cloneDraft', () => {
    const a = newRuleDraft();
    const b = cloneDraft(a);
    expect(isDirty(a, b)).toBe(false);
    b.name = 'x';
    expect(isDirty(a, b)).toBe(true);
  });
});

describe('moveField', () => {
  it('troca vizinhos e ignora os limites', () => {
    expect(moveField([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveField([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveField([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveField([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it('não altera o original', () => {
    const src = [1, 2];
    moveField(src, 0, 1);
    expect(src).toEqual([1, 2]);
  });
});

describe('duplicateRule', () => {
  it('cria id novo e nome "(cópia)" sem alterar o original', () => {
    const rule = makeRule();
    const copy = duplicateRule(rule, [rule], { now: NOW, rng: () => 0.3 });
    expect(copy.id).not.toBe(rule.id);
    expect(copy.name).toBe('Regra A (cópia)');
    expect(copy.updatedAt).toBe(NOW.toISOString());
    expect(copy.fields).toEqual(rule.fields);
    expect(copy.fields).not.toBe(rule.fields);
    expect(rule.name).toBe('Regra A');
    expect(parseRule(copy).ok).toBe(true);
  });

  it('copiar a cópia numera o nome', () => {
    const rule = makeRule();
    const c1 = duplicateRule(rule, [rule]);
    const c2 = duplicateRule(rule, [rule, c1]);
    expect(c2.name).toBe('Regra A (cópia 2)');
    expect(new Set([rule.id, c1.id, c2.id]).size).toBe(3);
  });
});

describe('sites', () => {
  it('hostOfPattern', () => {
    expect(hostOfPattern('https://app.clinicaexperts.com.br/*')).toBe('app.clinicaexperts.com.br');
    expect(hostOfPattern('http://localhost/*')).toBe('localhost');
    expect(hostOfPattern('*://*/*')).toBe('*');
    expect(hostOfPattern('')).toBeNull();
    expect(hostOfPattern(undefined)).toBeNull();
    expect(hostOfPattern('lixo')).toBeNull();
  });

  it('"*" vira "qualquer site"', () => {
    expect(siteLabel('*://*/*')).toBe(ANY_SITE);
    expect(siteLabel('https://a.com/*')).toBe('a.com');
  });

  it('groupRulesBySite agrupa, ordena e deixa "qualquer site" por último', () => {
    const a = makeRule({ id: '1', name: 'Zeta' });
    const b = makeRule({ id: '2', name: 'Alfa' });
    const any = makeRule({
      id: '3',
      name: 'Geral',
      trigger: { ...a.trigger, urlPatterns: ['*://*/*'] },
    });
    const other = makeRule({
      id: '4',
      name: 'Outra',
      trigger: { ...a.trigger, urlPatterns: ['https://a.com/*'] },
    });
    const groups = groupRulesBySite([a, any, other, b]);
    expect(groups.map((g) => g.site)).toEqual(['a.com', 'app.site.com', ANY_SITE]);
    expect(groups[1]?.rules.map((r) => r.name)).toEqual(['Alfa', 'Zeta']);
  });

  it('fieldCountLabel', () => {
    expect(fieldCountLabel(1)).toBe('1 campo');
    expect(fieldCountLabel(0)).toBe('0 campos');
    expect(fieldCountLabel(3)).toBe('3 campos');
  });
});

describe('prioridade da regra', () => {
  it('ausente: não grava a chave e o rascunho fica null', () => {
    const d = ruleToDraft(makeRule());
    expect(d.priority).toBeNull();
    expect('priority' in (draftToRuleInput(d, { now: NOW }) as object)).toBe(false);
  });

  it('preenchida: vai e volta; vazio volta a omitir', () => {
    const d = ruleToDraft(makeRule({ priority: 80 }));
    expect(d.priority).toBe(80);
    expect(d.extra?.priority).toBeUndefined();
    const input = draftToRuleInput(d, { now: NOW }) as { priority?: number };
    expect(input.priority).toBe(80);
    d.priority = null;
    expect('priority' in (draftToRuleInput(d, { now: NOW }) as object)).toBe(false);
  });

  it('preserva chaves extras e valida a faixa', () => {
    const d = ruleToDraft(makeRule({ priority: 5, ...({ futuro: 1 } as object) }));
    expect(d.extra).toEqual({ futuro: 1 });
    expect(validateDraft({ ...d, priority: 101 }).byKey.priority).toBeDefined();
    expect(validateDraft({ ...d, priority: 1.5 }).byKey.priority).toBeDefined();
    expect(validateDraft({ ...d, priority: 0 }).ok).toBe(true);
  });
});
