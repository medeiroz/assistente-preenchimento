import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRule, type Rule, type RunReport } from '../../../src/core/model';
import {
  createChromeHistoryRepository,
  createChromeSyncRepository,
  seedIfEmpty,
  StorageQuotaError,
  type StorageAreaLike,
  type StorageChanges,
} from '../../../src/core/storage';

type Listener = (changes: StorageChanges, area: string) => void;

/** Fake em memória que emite onChanged como o Chrome. */
function makeFake(area = 'sync') {
  const data = new Map<string, unknown>();
  const listeners = new Set<Listener>();
  const emit = (changes: StorageChanges) => {
    for (const l of listeners) l(changes, area);
  };
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const setSpy = vi.fn();
  const storage: StorageAreaLike = {
    async get(keys) {
      const out: Record<string, unknown> = {};
      const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (data.has(k)) out[k] = clone(data.get(k));
      return out;
    },
    async set(items) {
      setSpy(items);
      const changes: StorageChanges = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data.get(k), newValue: clone(v) };
        data.set(k, clone(v));
      }
      emit(changes);
    },
    async remove(keys) {
      const changes: StorageChanges = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (data.has(k)) changes[k] = { oldValue: data.get(k) };
        data.delete(k);
      }
      emit(changes);
    },
  };
  const onChanged = (cb: Listener) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  return { data, storage, onChanged, emit, setSpy };
}

function makeRule(id: string, extra: Record<string, unknown> = {}): Rule {
  const r = parseRule({
    id,
    name: `Regra ${id}`,
    trigger: { urlPatterns: ['https://exemplo.com/*'] },
    behavior: {},
    fields: [{ id: 'f', locator: { by: 'label', text: 'Campo' }, value: 'v' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

function bigRule(id: string): Rule {
  const fields = Array.from({ length: 80 }, (_, i) => ({
    id: `campo-${i}`,
    locator: { by: 'label', text: `Rótulo bem comprido do campo número ${i}` },
    value: `valor longo de preenchimento ${i}`,
  }));
  return makeRule(id, { fields });
}

function setup() {
  const fake = makeFake();
  const repo = createChromeSyncRepository({ sync: fake.storage, onChanged: fake.onChanged });
  return { fake, repo };
}

describe('createChromeSyncRepository', () => {
  it('load vazio devolve config vazia', async () => {
    const { repo } = setup();
    const c = await repo.load();
    expect(c.rules).toEqual([]);
    expect(c.variables).toEqual([]);
    expect(c.settings.pausedHosts).toEqual([]);
  });

  it('saveRule/load round-trip com defaults e updatedAt atualizado', async () => {
    const { repo, fake } = setup();
    await repo.saveRule(makeRule('a'));
    const c = await repo.load();
    expect(c.rules).toHaveLength(1);
    const r = c.rules[0]!;
    expect(r.id).toBe('a');
    expect(r.enabled).toBe(true);
    expect(r.behavior.mode).toBe('auto');
    expect(r.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(fake.data.get('cfg:meta')).toMatchObject({ schemaVersion: 1, ruleIds: ['a'] });
    expect(fake.data.has('rule:a')).toBe(true);
  });

  it('mantém a ordem de ruleIds; regra existente fica no lugar', async () => {
    const { repo } = setup();
    await repo.saveRule(makeRule('a'));
    await repo.saveRule(makeRule('b'));
    await repo.saveRule(makeRule('c'));
    await repo.saveRule(makeRule('a', { name: 'Renomeada' }));
    const c = await repo.load();
    expect(c.rules.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(c.rules[0]?.name).toBe('Renomeada');
  });

  it('saveRule concorrente não perde ids', async () => {
    const { repo } = setup();
    await Promise.all([repo.saveRule(makeRule('a')), repo.saveRule(makeRule('b'))]);
    expect((await repo.load()).rules.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('deleteRule remove a regra e o id', async () => {
    const { repo, fake } = setup();
    await repo.saveRule(makeRule('a'));
    await repo.saveRule(makeRule('b'));
    await repo.deleteRule('a');
    expect((await repo.load()).rules.map((r) => r.id)).toEqual(['b']);
    expect(fake.data.has('rule:a')).toBe(false);
  });

  it('saveVariables e saveSettings persistem', async () => {
    const { repo } = setup();
    await repo.saveRule(makeRule('a'));
    await repo.saveVariables([{ key: 'x', label: 'X', value: '1' }]);
    await repo.saveSettings({ pausedHosts: ['a.com'] });
    const c = await repo.load();
    expect(c.variables).toEqual([{ key: 'x', label: 'X', value: '1' }]);
    expect(c.settings.pausedHosts).toEqual(['a.com']);
    await expect(repo.saveVariables([{ key: 'X!', label: '', value: '' }])).rejects.toThrow();
  });

  it('replaceAll escreve tudo e remove sobras', async () => {
    const { repo, fake } = setup();
    await repo.saveRule(makeRule('a'));
    await repo.saveRule(makeRule('b'));
    const cfg = await repo.load();
    await repo.replaceAll({
      ...cfg,
      rules: [makeRule('b'), makeRule('c')],
      variables: [{ key: 'k', label: 'K', value: 'v' }],
    });
    expect(fake.data.has('rule:a')).toBe(false);
    const c = await repo.load();
    expect(c.rules.map((r) => r.id)).toEqual(['b', 'c']);
    expect(c.variables).toHaveLength(1);
  });

  it('regra > 8 KB lança StorageQuotaError e nada é escrito', async () => {
    const { repo, fake } = setup();
    await expect(repo.saveRule(bigRule('grande'))).rejects.toBeInstanceOf(StorageQuotaError);
    await expect(repo.saveRule(bigRule('grande'))).rejects.toThrow(/Regra muito grande.*de 8 KB/);
    expect(fake.setSpy).not.toHaveBeenCalled();
    expect(fake.data.size).toBe(0);
    await expect(
      repo.replaceAll({ ...(await repo.load()), rules: [bigRule('g')] }),
    ).rejects.toBeInstanceOf(StorageQuotaError);
    expect(fake.setSpy).not.toHaveBeenCalled();
  });

  it('regra inválida no storage é descartada com warning sem derrubar as outras', async () => {
    const { repo, fake } = setup();
    await repo.saveRule(makeRule('a'));
    await repo.saveRule(makeRule('b'));
    fake.data.set('rule:a', { id: 'a', quebrada: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = await repo.load();
    expect(c.rules.map((r) => r.id)).toEqual(['b']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('onChange', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('dispara uma vez (debounce) para várias escritas', async () => {
      const { repo } = setup();
      const cb = vi.fn();
      repo.onChange(cb);
      await repo.saveRule(makeRule('a'));
      await repo.saveRule(makeRule('b'));
      await repo.saveSettings({ pausedHosts: ['x.com'] });
      expect(cb).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0]?.[0].rules).toHaveLength(2);
      expect(cb.mock.calls[0]?.[0].settings.pausedHosts).toEqual(['x.com']);
    });

    it('ignora chaves irrelevantes e outras áreas; unsubscribe para', async () => {
      const { repo, fake } = setup();
      const cb = vi.fn();
      const off = repo.onChange(cb);
      fake.emit({ outra: { newValue: 1 } });
      await vi.advanceTimersByTimeAsync(100);
      expect(cb).not.toHaveBeenCalled();
      const local = makeFake('local');
      const repo2 = createChromeSyncRepository({
        sync: local.storage,
        onChanged: local.onChanged,
      });
      const cb2 = vi.fn();
      repo2.onChange(cb2);
      await repo2.saveRule(makeRule('a'));
      await vi.advanceTimersByTimeAsync(100);
      expect(cb2).not.toHaveBeenCalled();
      off();
      await repo.saveRule(makeRule('z'));
      await vi.advanceTimersByTimeAsync(100);
      expect(cb).not.toHaveBeenCalled();
    });
  });
});

describe('seedIfEmpty', () => {
  it('grava uma vez e respeita config vazia existente', async () => {
    const { repo, fake } = setup();
    expect(await seedIfEmpty(repo, [makeRule('p1')])).toBe(true);
    expect((await repo.load()).rules.map((r) => r.id)).toEqual(['p1']);
    expect(fake.data.get('rule:p1')).toMatchObject({ updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(await seedIfEmpty(repo, [makeRule('p2')])).toBe(false);
    await repo.deleteRule('p1');
    expect(await seedIfEmpty(repo, [makeRule('p1')])).toBe(false);
    expect((await repo.load()).rules).toEqual([]);
  });

  it('com 0 presets também marca a instalação', async () => {
    const { repo } = setup();
    await seedIfEmpty(repo, []);
    expect(await repo.isInitialized()).toBe(true);
    expect(await seedIfEmpty(repo, [makeRule('p')])).toBe(false);
  });
});

describe('createChromeHistoryRepository', () => {
  const report = (n: number): RunReport => ({
    ruleId: `r${n}`,
    ruleName: `R${n}`,
    origin: 'auto',
    url: 'https://exemplo.com',
    startedAt: new Date(n).toISOString(),
    fields: [],
  });

  it('mais novo primeiro, limite de 50, limit e clear', async () => {
    const local = makeFake('local');
    const h = createChromeHistoryRepository({ local: local.storage });
    expect(await h.list()).toEqual([]);
    for (let i = 0; i < 60; i++) await h.append(report(i));
    const all = await h.list();
    expect(all).toHaveLength(50);
    expect(all[0]?.ruleId).toBe('r59');
    expect(all[49]?.ruleId).toBe('r10');
    expect(await h.list(3)).toHaveLength(3);
    await h.clear();
    expect(await h.list()).toEqual([]);
  });
});
