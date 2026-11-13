import { describe, expect, it } from 'vitest';
import { parseRule, type Locator, type Rule } from '../../../src/core/model';
import { AdapterError } from '../../../src/core/adapters/types';
import type { AdapterRegistry, FieldAdapter } from '../../../src/core/adapters/types';
import type { LocateFn } from '../../../src/core/locator/types';
import { createSession, type SessionDeps } from '../../../src/core/engine/session';

interface Opts {
  overwrite?: 'onlyIfDefault' | 'always';
  fields?: { id: string; value?: string; enabled?: boolean }[];
}

function makeRule(o: Opts = {}): Rule {
  const fields = o.fields ?? [{ id: 'a' }];
  const r = parseRule({
    id: 'r1',
    name: 'Regra',
    trigger: { urlPatterns: ['https://exemplo.com/*'] },
    behavior: { overwrite: o.overwrite ?? 'onlyIfDefault' },
    fields: fields.map((f) => ({
      id: f.id,
      enabled: f.enabled ?? true,
      locator: { by: 'name', name: f.id },
      value: f.value ?? `v-${f.id}`,
    })),
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

class Fake {
  values = new Map<string, string>();
  writes: string[] = [];
  readThrows = false;
  writeError: Error | null = null;
  verifyResult = true;
  adapterId: FieldAdapter['id'] = 'native-text';
  delay = 0;
  withClear = false;
  clearError: Error | null = null;
  clears: string[] = [];

  adapter: FieldAdapter = {
    id: 'native-text',
    detect: () => true,
    read: (root) => {
      if (this.readThrows) throw new Error('boom');
      return this.values.get(root.id) || null;
    },
    isDefault: (root) => !this.values.get(root.id),
    write: async (root, value) => {
      if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
      if (this.writeError) throw this.writeError;
      this.writes.push(`${root.id}=${value}`);
      this.values.set(root.id, value);
    },
    verify: () => this.verifyResult,
  };
  noAdapter = false;
  present = new Set<string>();
  container = document.createElement('div');

  constructor(ids: string[] = ['a']) {
    for (const id of ids) {
      const el = document.createElement('div');
      el.id = id;
      this.container.appendChild(el);
      this.present.add(id);
    }
  }

  locate: LocateFn = (l: Locator) => {
    if (l.by !== 'name' || !this.present.has(l.name)) return null;
    return this.container.querySelector(`#${l.name}`);
  };

  registry: AdapterRegistry = {
    register: () => undefined,
    resolve: () => {
      if (this.noAdapter) return null;
      const base = { ...this.adapter, id: this.adapterId };
      if (!this.withClear) return base;
      return {
        ...base,
        clear: async (root: Element) => {
          if (this.clearError) throw this.clearError;
          this.clears.push(root.id);
          this.values.set(root.id, '');
        },
      };
    },
    list: () => [this.adapter],
  };

  deps(resolve?: SessionDeps['resolveValue']): SessionDeps {
    return {
      locate: this.locate,
      adapters: this.registry,
      resolveValue: resolve ?? ((t) => ({ ok: true, value: t })),
      now: () => new Date('2026-11-13T10:00:00.000Z'),
      url: () => 'https://exemplo.com/p',
    };
  }
}

function outcomes(r: { fields: { fieldId: string; outcome: string }[] }): string[] {
  return r.fields.map((f) => `${f.fieldId}:${f.outcome}`);
}

describe('FillSession', () => {
  it('1 preenche campo vazio', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:filled']);
    expect(r.fields[0]?.newValue).toBe('v-a');
    expect(f.writes).toEqual(['a=v-a']);
  });

  it('2 campo já carregado vira skipped-not-default', async () => {
    const f = new Fake();
    f.values.set('a', 'existente');
    const s = createSession(makeRule(), f.container, f.deps());
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:skipped-not-default']);
    expect(r.fields[0]?.previousValue).toBe('existente');
    expect(f.writes).toEqual([]);
  });

  it('3 overwrite always preenche mesmo carregado', async () => {
    const f = new Fake();
    f.values.set('a', 'existente');
    const s = createSession(makeRule({ overwrite: 'always' }), f.container, f.deps());
    expect(outcomes(await s.fill('auto'))).toEqual(['a:filled']);
    expect(f.values.get('a')).toBe('v-a');
  });

  it('4 usuário apaga após filled: não re-preenche na mesma sessão', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    f.values.set('a', '');
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:skipped-already-handled']);
    expect(f.writes).toHaveLength(1);
  });

  it('5 nova sessão preenche de novo', async () => {
    const f = new Fake();
    const rule = makeRule();
    await createSession(rule, f.container, f.deps()).fill('auto');
    f.values.set('a', '');
    const r = await createSession(rule, f.container, f.deps()).fill('auto');
    expect(outcomes(r)).toEqual(['a:filled']);
    expect(f.writes).toHaveLength(2);
  });

  it('6 campo não encontrado: not-found e continua pendente', async () => {
    const f = new Fake(['a']);
    f.present.delete('a');
    const s = createSession(makeRule(), f.container, f.deps());
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:not-found']);
    expect(s.pendingFields()).toEqual(['a']);
  });

  it('7 campo tardio: handleChange preenche; padrão avaliado ao aparecer', async () => {
    const f = new Fake(['a', 'b']);
    f.present.delete('b');
    const s = createSession(
      makeRule({ fields: [{ id: 'a' }, { id: 'b' }] }),
      f.container,
      f.deps(),
    );
    await s.fill('auto');
    expect(s.pendingFields()).toEqual(['b']);
    expect(await s.handleChange()).toBeNull();
    f.present.add('b');
    f.values.set('b', 'ja-veio');
    const r = await s.handleChange();
    expect(r && outcomes(r)).toEqual(['a:skipped-already-handled', 'b:skipped-not-default']);
    expect(s.pendingFields()).toEqual([]);
    expect(await s.handleChange()).toBeNull();
  });

  it('7b campo tardio vazio é preenchido', async () => {
    const f = new Fake(['a']);
    f.present.delete('a');
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    f.present.add('a');
    const r = await s.handleChange();
    expect(r && outcomes(r)).toEqual(['a:filled']);
  });

  it('8 expressão não resolvida', async () => {
    const f = new Fake();
    const s = createSession(
      makeRule(),
      f.container,
      f.deps(() => ({ ok: false, error: 'variável x inexistente' })),
    );
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:skipped-unresolved-value']);
    expect(r.fields[0]?.message).toBe('variável x inexistente');
    expect(f.writes).toEqual([]);
  });

  it('9 AdapterError vira error e os demais campos continuam', async () => {
    const f = new Fake(['a', 'b']);
    const orig = f.adapter.write;
    f.adapter.write = async (root, v) => {
      if (root.id === 'a') throw new AdapterError('opção não encontrada', 'option-not-found');
      return orig(root, v);
    };
    const s = createSession(
      makeRule({ fields: [{ id: 'a' }, { id: 'b' }] }),
      f.container,
      f.deps(),
    );
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:error', 'b:filled']);
    expect(r.fields[0]?.message).toBe('opção não encontrada');
  });

  it('10 verify falso vira error', async () => {
    const f = new Fake();
    f.verifyResult = false;
    const s = createSession(makeRule(), f.container, f.deps());
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:error']);
    expect(r.fields[0]?.message).toContain('verify-failed');
  });

  it('11 campo desabilitado', async () => {
    const f = new Fake();
    const s = createSession(
      makeRule({ fields: [{ id: 'a', enabled: false }] }),
      f.container,
      f.deps(),
    );
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:skipped-disabled']);
    expect(s.pendingFields()).toEqual([]);
    expect(f.writes).toEqual([]);
  });

  it('12 nenhum adaptador vira error', async () => {
    const f = new Fake();
    f.noAdapter = true;
    const s = createSession(makeRule(), f.container, f.deps());
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:error']);
    expect(r.fields[0]?.message).toBe('nenhum adaptador compatível');
    expect(s.pendingFields()).toEqual([]);
  });

  it('13 manual refaz campo skipped-not-default esvaziado pelo usuário', async () => {
    const f = new Fake();
    f.values.set('a', 'existente');
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    expect(f.writes).toEqual([]);
    expect(outcomes(await s.fill('manual'))).toEqual(['a:skipped-not-default']);
    f.values.set('a', '');
    expect(outcomes(await s.fill('manual'))).toEqual(['a:filled']);
    const again = await s.fill('manual');
    expect(outcomes(again)).toEqual(['a:skipped-already-handled']);
    expect(again.fields[0]?.message).toBe('já está com este valor');
    expect(f.writes).toHaveLength(1);
  });

  it('13b manual preenche campo que a extensão preencheu e o usuário esvaziou', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    f.values.set('a', '');
    expect(outcomes(await s.fill('manual'))).toEqual(['a:filled']);
    expect(f.writes).toEqual(['a=v-a', 'a=v-a']);
    // o auto continua sem re-preencher depois
    f.values.set('a', '');
    expect(outcomes(await s.fill('auto'))).toEqual(['a:skipped-already-handled']);
  });

  it('13e manual sobre campo já preenchido pela sessão preserva o Desfazer', async () => {
    const f = new Fake();
    f.withClear = true;
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    expect(outcomes(await s.fill('manual'))).toEqual(['a:skipped-already-handled']);
    expect(outcomes(await s.undo())).toEqual(['a:undone']);
    expect(f.values.get('a')).toBe('');
  });

  it('13c manual: valor não resolvido, desabilitado, não encontrado', async () => {
    const f = new Fake(['a', 'b', 'c']);
    f.present.delete('c');
    const s = createSession(
      makeRule({ fields: [{ id: 'a' }, { id: 'b', enabled: false }, { id: 'c' }] }),
      f.container,
      f.deps((t) => (t === 'v-a' ? { ok: false, error: 'sem valor' } : { ok: true, value: t })),
    );
    expect(outcomes(await s.fill('manual'))).toEqual([
      'a:skipped-unresolved-value',
      'b:skipped-disabled',
      'c:not-found',
    ]);
  });

  it('13d manual: onlyIfDefault reavaliado agora (usuário digitou depois do auto)', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    f.values.set('a', 'digitado');
    expect(outcomes(await s.fill('manual'))).toEqual(['a:skipped-not-default']);
    expect(f.values.get('a')).toBe('digitado');
  });

  it('14 undo restaura texto', async () => {
    const f = new Fake();
    f.values.set('a', 'antigo');
    const s = createSession(makeRule({ overwrite: 'always' }), f.container, f.deps());
    await s.fill('auto');
    expect(f.values.get('a')).toBe('v-a');
    const r = await s.undo();
    expect(f.values.get('a')).toBe('antigo');
    expect(r.fields[0]).toMatchObject({
      outcome: 'undone',
      previousValue: 'v-a',
      newValue: 'antigo',
    });
    // desfeito conta como tratado
    expect(outcomes(await s.fill('auto'))).toEqual(['a:skipped-already-handled']);
    expect(f.values.get('a')).toBe('antigo');
  });

  it('14b undo sem valor anterior e sem clear reporta error', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    const r = await s.undo();
    expect(outcomes(r)).toEqual(['a:error']);
    expect(r.fields[0]?.message).toBe('não é possível desfazer');
    expect(f.values.get('a')).toBe('v-a');
  });

  it('14c undo sem valor anterior usa clear() quando existe', async () => {
    const f = new Fake();
    f.withClear = true;
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    const r = await s.undo();
    expect(outcomes(r)).toEqual(['a:undone']);
    expect(r.fields[0]).toMatchObject({ previousValue: 'v-a', newValue: '' });
    expect(f.clears).toEqual(['a']);
    expect(f.values.get('a')).toBe('');
    expect((await s.undo()).fields).toEqual([]);
  });

  it('14d undo com valor anterior escreve, mesmo havendo clear()', async () => {
    const f = new Fake();
    f.withClear = true;
    f.values.set('a', 'antigo');
    const s = createSession(makeRule({ overwrite: 'always' }), f.container, f.deps());
    await s.fill('auto');
    await s.undo();
    expect(f.clears).toEqual([]);
    expect(f.values.get('a')).toBe('antigo');
  });

  it('14e falha no clear vira error', async () => {
    const f = new Fake();
    f.withClear = true;
    f.clearError = new AdapterError('x', 'write-failed');
    const s = createSession(makeRule(), f.container, f.deps());
    await s.fill('auto');
    const r = await s.undo();
    expect(outcomes(r)).toEqual(['a:error']);
    expect(r.fields[0]?.message).toBe('x');
  });

  it('15 end() impede escrita', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    s.end();
    expect(s.ended).toBe(true);
    expect((await s.fill('auto')).fields).toEqual([]);
    expect(await s.handleChange()).toBeNull();
    expect((await s.undo()).fields).toEqual([]);
    expect(f.writes).toEqual([]);
  });

  it('16 fills simultâneos escrevem uma única vez por campo', async () => {
    const f = new Fake(['a', 'b']);
    f.delay = 5;
    const s = createSession(
      makeRule({ fields: [{ id: 'a' }, { id: 'b' }] }),
      f.container,
      f.deps(),
    );
    const [r1, r2] = await Promise.all([s.fill('auto'), s.fill('auto')]);
    expect(f.writes).toEqual(['a=v-a', 'b=v-b']);
    expect(outcomes(r1)).toEqual(['a:filled', 'b:filled']);
    expect(outcomes(r2)).toEqual(['a:skipped-already-handled', 'b:skipped-already-handled']);
  });

  it('17 relatório: ordem, description, startedAt, url, origin', async () => {
    const f = new Fake(['b', 'a']);
    const s = createSession(
      makeRule({ fields: [{ id: 'b' }, { id: 'a' }] }),
      f.container,
      f.deps(),
    );
    const r = await s.fill('manual');
    expect(r).toMatchObject({
      ruleId: 'r1',
      ruleName: 'Regra',
      startedAt: '2026-11-13T10:00:00.000Z',
      url: 'https://exemplo.com/p',
      origin: 'manual',
    });
    expect(r.fields.map((x) => x.fieldId)).toEqual(['b', 'a']);
    expect(r.fields[0]?.description).toBe('name=b');
  });

  it('18 exceção inesperada no read vira error sem lançar', async () => {
    const f = new Fake(['a', 'b']);
    f.readThrows = true;
    const s = createSession(
      makeRule({ fields: [{ id: 'a' }, { id: 'b' }] }),
      f.container,
      f.deps(),
    );
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:error', 'b:error']);
    expect(r.fields[0]?.message).toBe('boom');
    expect(f.writes).toEqual([]);
  });

  it('snapshot é idempotente: o padrão é registrado uma única vez', async () => {
    const f = new Fake();
    const s = createSession(makeRule(), f.container, f.deps());
    s.snapshot();
    f.values.set('a', 'digitado depois');
    s.snapshot();
    const r = await s.fill('auto');
    expect(outcomes(r)).toEqual(['a:filled']);
  });
});
