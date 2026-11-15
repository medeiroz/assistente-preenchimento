import { beforeEach, describe, expect, it } from 'vitest';
import { parseRule, type Locator, type Rule } from '../../src/core/model';
import { dateAdapter, nativeTextAdapter } from '../../src/core/adapters';
import { stripNonAlnum, typeText, valueMatches } from '../../src/core/adapters/dom';
import type { AdapterRegistry, FieldAdapter, WriteOptions } from '../../src/core/adapters/types';
import type { LocateFn } from '../../src/core/locator/types';
import { createSession } from '../../src/core/engine/session';
import {
  dropTarget,
  reorderFields,
  ruleToDraft,
  validateDraft,
  draftToRuleInput,
} from '../../src/entrypoints/options/composables/draft';

const BASE = {
  id: 'r1',
  name: 'Regra',
  trigger: { urlPatterns: ['https://exemplo.com/*'] },
  updatedAt: '2026-11-13T00:00:00.000Z',
};
const field = (extra: Record<string, unknown> = {}) => ({
  id: 'f1',
  locator: { by: 'name', name: 'f1' },
  value: 'x',
  ...extra,
});
const rule = (fields: Record<string, unknown>[]): Rule => {
  const r = parseRule({ ...BASE, fields });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
};

describe('schema: delayMs e typing', () => {
  it('são opcionais e não aparecem quando ausentes (round-trip estável)', () => {
    const r = rule([field()]);
    expect(Object.keys(r.fields[0] ?? {})).not.toContain('delayMs');
    expect(Object.keys(r.fields[0] ?? {})).not.toContain('typing');
    const again = parseRule(JSON.parse(JSON.stringify(r)));
    expect(again.ok && again.rule).toEqual(r);
  });

  it('aceita valores válidos e preserva no round-trip', () => {
    const r = rule([field({ delayMs: 500, typing: { keyDelayMs: 50 } })]);
    expect(r.fields[0]).toMatchObject({ delayMs: 500, typing: { keyDelayMs: 50 } });
    const again = parseRule(JSON.parse(JSON.stringify(r)));
    expect(again.ok && again.rule).toEqual(r);
  });

  it('aceita os limites', () => {
    expect(() =>
      rule([field({ delayMs: 0 }), { ...field({ typing: { keyDelayMs: 2000 } }), id: 'b' }]),
    ).not.toThrow();
    expect(() => rule([field({ delayMs: 60000, typing: { keyDelayMs: 0 } })])).not.toThrow();
  });

  it.each([
    [{ delayMs: -1 }, 'negativo'],
    [{ delayMs: 60001 }, '60000'],
    [{ delayMs: 1.5 }, 'inteiro'],
    [{ typing: { keyDelayMs: 2001 } }, '2000'],
    [{ typing: { keyDelayMs: -5 } }, 'negativo'],
  ])('rejeita %j', (extra, msg) => {
    const r = parseRule({ ...BASE, fields: [field(extra)] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain(msg);
  });
});

describe('rascunho (draft)', () => {
  it('regra sem as opções gera o mesmo JSON de antes', () => {
    const r = rule([field()]);
    const input = draftToRuleInput(ruleToDraft(r)) as { fields: Record<string, unknown>[] };
    expect(input.fields[0]).not.toHaveProperty('delayMs');
    expect(input.fields[0]).not.toHaveProperty('typing');
  });

  it('converte regra -> rascunho -> regra com atraso e digitação', () => {
    const r = rule([field({ delayMs: 800, typing: { keyDelayMs: 120 } })]);
    const d = ruleToDraft(r);
    expect(d.fields[0]).toMatchObject({ delayMs: 800, typing: true, keyDelayMs: 120 });
    const v = validateDraft(d, { now: new Date('2026-11-13T00:00:00.000Z') });
    expect(v.ok).toBe(true);
    expect(v.rule?.fields[0]).toMatchObject({ delayMs: 800, typing: { keyDelayMs: 120 } });
  });

  it('atraso 0 ou vazio não é gravado', () => {
    const d = ruleToDraft(rule([field({ delayMs: 300 })]));
    d.fields[0]!.delayMs = 0;
    expect(validateDraft(d).rule?.fields[0]).not.toHaveProperty('delayMs');
    d.fields[0]!.delayMs = null;
    expect(validateDraft(d).rule?.fields[0]).not.toHaveProperty('delayMs');
  });

  it('valida faixas com mensagens em português', () => {
    const d = ruleToDraft(rule([field()]));
    d.fields[0]!.delayMs = 70000;
    d.fields[0]!.typing = true;
    d.fields[0]!.keyDelayMs = 5000;
    const v = validateDraft(d);
    expect(v.ok).toBe(false);
    expect(v.byKey['fields.f1.delay']?.[0]).toContain('60000');
    expect(v.byKey['fields.f1.keyDelay']?.[0]).toContain('2000');
  });

  it('intervalo vazio com digitação ligada é erro', () => {
    const d = ruleToDraft(rule([field({ typing: { keyDelayMs: 50 } })]));
    d.fields[0]!.keyDelayMs = null;
    expect(validateDraft(d).byKey['fields.f1.keyDelay']).toBeDefined();
  });
});

describe('reorderFields / dropTarget', () => {
  it('move para frente e para trás sem mutar', () => {
    const a = ['a', 'b', 'c', 'd'];
    expect(reorderFields(a, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderFields(a, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(a).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ignora índices inválidos ou iguais', () => {
    expect(reorderFields(['a', 'b'], 0, 0)).toEqual(['a', 'b']);
    expect(reorderFields(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(reorderFields(['a', 'b'], -1, 1)).toEqual(['a', 'b']);
  });
  it('calcula o destino da linha de inserção', () => {
    expect(dropTarget(0, 2, 'before')).toBe(1);
    expect(dropTarget(0, 2, 'after')).toBe(2);
    expect(dropTarget(3, 1, 'before')).toBe(1);
    expect(dropTarget(3, 1, 'after')).toBe(2);
    expect(dropTarget(1, 1, 'after')).toBe(1);
    expect(dropTarget(1, 2, 'before')).toBe(1);
  });
});

describe('typeText', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="i" />';
  });
  const input = () => document.getElementById('i') as HTMLInputElement;

  /** Máscara de CPF que reformata a cada input (como plugins de máscara). */
  function cpfMask(el: HTMLInputElement) {
    el.addEventListener('input', () => {
      const d = el.value.replace(/\D/g, '').slice(0, 11);
      el.value = d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    });
  }

  it('emite keydown, keypress, input, keyup por caractere, depois change e blur', async () => {
    const el = input();
    const log: string[] = [];
    for (const t of ['keydown', 'keypress', 'input', 'keyup', 'change', 'blur', 'focus']) {
      el.addEventListener(t, (e) => {
        const ev = e as KeyboardEvent & InputEvent;
        log.push(
          t === 'input'
            ? `input:${ev.inputType}:${ev.data ?? ''}`
            : t === 'keydown'
              ? `keydown:${ev.key}`
              : t,
        );
      });
    }
    const sleeps: number[] = [];
    await typeText(el, 'ab', 30, async (ms) => void sleeps.push(ms));
    expect(log).toEqual([
      'focus',
      'input:deleteContentBackward:',
      'keydown:a',
      'keypress',
      'input:insertText:a',
      'keyup',
      'keydown:b',
      'keypress',
      'input:insertText:b',
      'keyup',
      'change',
      'blur',
    ]);
    expect(el.value).toBe('ab');
    expect(sleeps).toEqual([30, 30]);
  });

  it('limpa o valor anterior antes de digitar', async () => {
    const el = input();
    el.value = 'antigo';
    await typeText(el, 'x', 0, async () => undefined);
    expect(el.value).toBe('x');
  });

  it('nunca emite Escape, Enter ou Tab; eventos de tecla borbulham até o document', async () => {
    const seen: string[] = [];
    document.addEventListener('keydown', (e) => seen.push(e.key));
    await typeText(input(), 'a 1-.', 0, async () => undefined);
    expect(seen).toEqual(['a', ' ', '1', '-', '.']);
    expect(seen).not.toContain('Escape');
    expect(seen).not.toContain('Enter');
  });

  it('máscara que reformata continua funcionando', async () => {
    const el = input();
    cpfMask(el);
    await typeText(el, '12345678909', 0, async () => undefined);
    expect(el.value).toBe('123.456.789-09');
  });

  it('keydown cancelado impede o caractere; maxlength é respeitado', async () => {
    const el = input();
    el.addEventListener('keydown', (e) => e.key === 'x' && e.preventDefault());
    el.maxLength = 3;
    await typeText(el, 'axbcd', 0, async () => undefined);
    expect(el.value).toBe('abc');
  });

  it('interrompe quando aborted() vira true', async () => {
    const el = input();
    let n = 0;
    const done = await typeText(
      el,
      'abcd',
      0,
      async () => undefined,
      () => n++ >= 2,
    );
    expect(done).toBe(false);
    expect(el.value).toBe('ab');
  });
});

describe('verify tolerante', () => {
  it('stripNonAlnum / valueMatches', () => {
    expect(stripNonAlnum('123.456.789-09')).toBe('12345678909');
    expect(valueMatches('123.456.789-09', '12345678909', true)).toBe(true);
    expect(valueMatches('123.456.789-09', '12345678909', false)).toBe(false);
    expect(valueMatches('123', '12345678909', true)).toBe(false);
    expect(valueMatches(null, 'x', true)).toBe(false);
  });

  it('native-text com typing aceita valor mascarado', async () => {
    document.body.innerHTML = '<div id="r"><input id="i" /></div>';
    const root = document.getElementById('r') as Element;
    const el = document.getElementById('i') as HTMLInputElement;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').replace(/^(\d{3})(\d)/, '$1.$2');
    });
    const opts: WriteOptions = { typing: { keyDelayMs: 0 }, sleep: async () => undefined };
    await nativeTextAdapter.write(root, '1234', opts);
    expect(el.value).toBe('123.4');
    expect(nativeTextAdapter.verify(root, '1234', opts)).toBe(true);
    expect(nativeTextAdapter.verify(root, '1234')).toBe(false);
  });

  it('date: texto digita; type=date e readonly caem na escrita normal', async () => {
    document.body.innerHTML =
      '<div id="a"><input class="eui-input-datepicker" /></div>' +
      '<div id="b"><input type="date" /></div>' +
      '<div id="c"><input class="eui-input-datepicker" readonly /></div>';
    const opts: WriteOptions = { typing: { keyDelayMs: 0 }, sleep: async () => undefined };
    let keys = 0;
    document.addEventListener('keydown', () => keys++);
    const a = document.getElementById('a') as Element;
    await dateAdapter.write(a, '2026-11-13', opts);
    expect(dateAdapter.read(a)).toBe('13/11/2026');
    expect(keys).toBe(10);
    await dateAdapter.write(document.getElementById('b') as Element, '13/11/2026', opts);
    await dateAdapter.write(document.getElementById('c') as Element, '13/11/2026', opts);
    expect(keys).toBe(10);
    expect(dateAdapter.verify(a, '13/11/2026', opts)).toBe(true);
  });
});

describe('engine: atraso e digitação por campo', () => {
  function setup(fields: Record<string, unknown>[], present: string[]) {
    const container = document.createElement('div');
    const log: string[] = [];
    const values = new Map<string, string>();
    const here = new Set(present);
    const locate: LocateFn = (l: Locator) => {
      if (l.by !== 'name') return null;
      log.push(`locate:${l.name}`);
      if (!here.has(l.name)) return null;
      const el = document.createElement('div');
      el.id = l.name;
      return el;
    };
    const writes: { id: string; options?: WriteOptions }[] = [];
    const adapter: FieldAdapter = {
      id: 'native-text',
      detect: () => true,
      read: (r) => values.get(r.id) || null,
      isDefault: (r) => !values.get(r.id),
      write: async (r, v, options) => {
        log.push(`write:${r.id}`);
        writes.push({ id: r.id, options });
        values.set(r.id, v);
      },
      verify: () => true,
    };
    const registry: AdapterRegistry = {
      register: () => undefined,
      resolve: () => adapter,
      list: () => [adapter],
    };
    return { container, log, here, writes, registry, locate };
  }

  it('espera ANTES de localizar e preenche na ordem da regra', async () => {
    const s = setup([], ['a', 'b']);
    const sleeps: number[] = [];
    const sess = createSession(
      rule([
        field({ id: 'a', locator: { by: 'name', name: 'a' } }),
        field({ id: 'b', locator: { by: 'name', name: 'b' }, delayMs: 700 }),
      ]),
      s.container,
      {
        locate: s.locate,
        adapters: s.registry,
        resolveValue: (t) => ({ ok: true, value: t }),
        now: () => new Date(),
        url: () => 'https://exemplo.com',
        sleep: async (ms) => {
          s.log.push(`sleep:${ms}`);
          sleeps.push(ms);
        },
      },
    );
    const r = await sess.fill('auto');
    expect(r.fields.map((f) => f.outcome)).toEqual(['filled', 'filled']);
    const after = s.log.slice(s.log.indexOf('write:a') + 1);
    expect(after.slice(0, 2)).toEqual(['sleep:700', 'locate:b']);
    expect(after).toContain('write:b');
    expect(sleeps).toEqual([700]);
  });

  it('campo que só aparece depois da espera é encontrado', async () => {
    const s = setup([], ['a']);
    const sess = createSession(
      rule([
        field({ id: 'a', locator: { by: 'name', name: 'a' } }),
        field({ id: 'b', locator: { by: 'name', name: 'b' }, delayMs: 100 }),
      ]),
      s.container,
      {
        locate: s.locate,
        adapters: s.registry,
        resolveValue: (t) => ({ ok: true, value: t }),
        now: () => new Date(),
        url: () => 'https://exemplo.com',
        sleep: async () => void s.here.add('b'),
      },
    );
    const r = await sess.fill('auto');
    expect(r.fields.map((f) => f.outcome)).toEqual(['filled', 'filled']);
  });

  it('passa typing e sleep ao adaptador só quando configurado', async () => {
    const s = setup([], ['a', 'b']);
    const sess = createSession(
      rule([
        field({ id: 'a', locator: { by: 'name', name: 'a' }, typing: { keyDelayMs: 20 } }),
        field({ id: 'b', locator: { by: 'name', name: 'b' } }),
      ]),
      s.container,
      {
        locate: s.locate,
        adapters: s.registry,
        resolveValue: (t) => ({ ok: true, value: t }),
        now: () => new Date(),
        url: () => 'https://exemplo.com',
      },
    );
    await sess.fill('auto');
    expect(s.writes[0]?.options?.typing).toEqual({ keyDelayMs: 20 });
    expect(typeof s.writes[0]?.options?.sleep).toBe('function');
    expect(s.writes[1]?.options).toBeUndefined();
  });

  it('end() durante a espera aborta sem preencher e sem timer pendente', async () => {
    const s = setup([], ['a']);
    const sess = createSession(
      rule([field({ id: 'a', locator: { by: 'name', name: 'a' }, delayMs: 60000 })]),
      s.container,
      {
        locate: s.locate,
        adapters: s.registry,
        resolveValue: (t) => ({ ok: true, value: t }),
        now: () => new Date(),
        url: () => 'https://exemplo.com',
      },
    );
    const p = sess.fill('auto');
    await Promise.resolve();
    sess.end();
    const r = await p;
    expect(r.fields).toEqual([]);
    expect(s.writes).toEqual([]);
  });

  it('end() também aborta com sleep injetado que nunca resolve', async () => {
    const s = setup([], ['a']);
    const sess = createSession(
      rule([field({ id: 'a', locator: { by: 'name', name: 'a' }, delayMs: 5000 })]),
      s.container,
      {
        locate: s.locate,
        adapters: s.registry,
        resolveValue: (t) => ({ ok: true, value: t }),
        now: () => new Date(),
        url: () => 'https://exemplo.com',
        sleep: () => new Promise(() => undefined),
      },
    );
    const p = sess.fill('auto');
    await Promise.resolve();
    sess.end();
    expect((await p).fields).toEqual([]);
  });

  it('desfazer não espera nem digita', async () => {
    const s = setup([], ['a']);
    const sleeps: number[] = [];
    const sess = createSession(
      rule([
        field({
          id: 'a',
          locator: { by: 'name', name: 'a' },
          delayMs: 300,
          typing: { keyDelayMs: 10 },
        }),
      ]),
      s.container,
      {
        locate: s.locate,
        adapters: s.registry,
        resolveValue: (t) => ({ ok: true, value: t }),
        now: () => new Date(),
        url: () => 'https://exemplo.com',
        sleep: async (ms) => void sleeps.push(ms),
      },
    );
    await sess.fill('auto');
    expect(sleeps).toEqual([300]);
    // sem valor anterior e sem clear: reporta erro, mas jamais espera
    await sess.undo();
    expect(sleeps).toEqual([300]);
  });
});
