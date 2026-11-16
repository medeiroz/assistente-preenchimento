import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_VARS_KEY,
  ReadOnlyConfigError,
  createChromeSyncRepository,
  type StorageAreaLike,
  type StorageChanges,
} from '../../../src/core/storage';
import type { Variable } from '../../../src/core/model';

type Listener = (changes: StorageChanges, area: string) => void;

function makeArea(name: string, listeners: Set<Listener>, initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const emit = (changes: StorageChanges) => {
    for (const l of listeners) l(changes, name);
  };
  const set = vi.fn();
  const storage: StorageAreaLike = {
    async get(keys) {
      const out: Record<string, unknown> = {};
      const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (data.has(k)) out[k] = clone(data.get(k));
      return out;
    },
    async set(items) {
      set(items);
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
  return { data, storage, set };
}

const META = { 'cfg:meta': { schemaVersion: 1, ruleIds: [] } };

function setup(syncInit: Record<string, unknown> = META, localInit: Record<string, unknown> = {}) {
  const listeners = new Set<Listener>();
  const sync = makeArea('sync', listeners, syncInit);
  const local = makeArea('local', listeners, localInit);
  const repo = createChromeSyncRepository({
    sync: sync.storage,
    local: local.storage,
    onChanged: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  });
  return { sync, local, repo };
}

const v = (
  key: string,
  value: string,
  scope?: 'sync' | 'local',
  extra: Record<string, unknown> = {},
): Variable => ({
  key,
  label: key,
  value,
  ...(scope ? { scope } : {}),
  ...extra,
});

type Setup = ReturnType<typeof setup>;
const syncVars = (s: Setup) => s.sync.data.get('cfg:variables');
const localVals = (s: Setup) => s.local.data.get(LOCAL_VARS_KEY);

describe('variáveis locais no repositório', () => {
  it('load mescla: local vem do storage.local; ausente vira vazio; sync segue igual', async () => {
    const s = setup(
      {
        'cfg:meta': { schemaVersion: 1, ruleIds: [] },
        'cfg:variables': [v('a', '', 'local'), v('b', '', 'local'), v('c', 'sync-val')],
      },
      { [LOCAL_VARS_KEY]: { a: 'segredo', morta: 'x' } },
    );
    const cfg = await s.repo.load();
    expect(cfg.variables.map((x) => [x.key, x.value])).toEqual([
      ['a', 'segredo'],
      ['b', ''],
      ['c', 'sync-val'],
    ]);
  });

  it('saveVariables: local grava value vazio no sync e o valor no local', async () => {
    const s = setup();
    await s.repo.saveVariables([v('a', 'segredo', 'local', { futuro: 1 }), v('b', 'pub')]);
    expect(syncVars(s)).toEqual([v('a', '', 'local', { futuro: 1 }), v('b', 'pub')]);
    expect(localVals(s)).toEqual({ a: 'segredo' });
    expect(JSON.stringify([...s.sync.data.values()])).not.toContain('segredo');
  });

  it('troca sync -> local zera o valor no sync', async () => {
    const s = setup();
    await s.repo.saveVariables([v('a', 'abc')]);
    await s.repo.saveVariables([v('a', 'abc', 'local')]);
    expect(syncVars(s)).toEqual([v('a', '', 'local')]);
    expect(localVals(s)).toEqual({ a: 'abc' });
  });

  it('troca local -> sync leva o valor ao sync e tira do local', async () => {
    const s = setup();
    await s.repo.saveVariables([v('a', 'abc', 'local')]);
    await s.repo.saveVariables([v('a', 'abc', 'sync')]);
    expect(syncVars(s)).toEqual([v('a', 'abc', 'sync')]);
    expect(localVals(s)).toBeUndefined();
  });

  it('remoção de variável local limpa a chave do local; outras ficam', async () => {
    const s = setup();
    await s.repo.saveVariables([v('a', '1', 'local'), v('b', '2', 'local')]);
    await s.repo.saveVariables([v('b', '2', 'local')]);
    expect(localVals(s)).toEqual({ b: '2' });
    await s.repo.saveVariables([]);
    expect(localVals(s)).toBeUndefined();
  });

  it('esvaziar o valor de uma local remove o valor do local', async () => {
    const s = setup();
    await s.repo.saveVariables([v('a', '1', 'local')]);
    await s.repo.saveVariables([v('a', '', 'local')]);
    expect(localVals(s)).toBeUndefined();
    expect((await s.repo.load()).variables[0]?.value).toBe('');
  });

  it('o limite de 8 KB vale só para o item do sync', async () => {
    const s = setup();
    const big = 'x'.repeat(20000);
    await s.repo.saveVariables([v('a', big, 'local')]);
    expect(localVals(s)).toEqual({ a: big });
    await expect(s.repo.saveVariables([v('a', big)])).rejects.toThrow(/muito grande/);
    // a falha não mexeu no local
    expect(localVals(s)).toEqual({ a: big });
  });

  it('replaceAll: local sem valor mantém o valor local existente; com valor grava', async () => {
    const s = setup();
    await s.repo.saveVariables([v('a', 'meu', 'local'), v('z', 'velho', 'local')]);
    const cfg = await s.repo.load();
    await s.repo.replaceAll({
      ...cfg,
      variables: [v('a', '', 'local'), v('n', 'novo', 'local'), v('p', 'pub')],
    });
    expect(syncVars(s)).toEqual([v('a', '', 'local'), v('n', '', 'local'), v('p', 'pub')]);
    expect(localVals(s)).toEqual({ a: 'meu', n: 'novo' });
  });

  it('onChange reage a mudanças em storage.local (vars:local) e ignora outras chaves', async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      await s.repo.saveVariables([v('a', '', 'local')]);
      const cb = vi.fn();
      s.repo.onChange(cb);
      await s.local.storage.set({ outra: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(cb).not.toHaveBeenCalled();
      await s.local.storage.set({ [LOCAL_VARS_KEY]: { a: 'novo' } });
      await vi.advanceTimersByTimeAsync(100);
      expect(cb).toHaveBeenCalledTimes(1);
      const cfg = cb.mock.calls[0]?.[0] as { variables: Variable[] };
      expect(cfg.variables[0]?.value).toBe('novo');
    } finally {
      vi.useRealTimers();
    }
  });

  it('somente leitura: recusa escrita e não toca em storage.local nem sync', async () => {
    const s = setup(
      {
        'cfg:meta': { schemaVersion: 2, ruleIds: [] },
        'cfg:variables': [v('a', '', 'local')],
      },
      { [LOCAL_VARS_KEY]: { a: 'x' } },
    );
    await expect(s.repo.saveVariables([v('a', 'y', 'local')])).rejects.toBeInstanceOf(
      ReadOnlyConfigError,
    );
    await expect(
      s.repo.replaceAll({ ...(await s.repo.load()), variables: [v('a', 'y', 'local')] }),
    ).rejects.toBeInstanceOf(ReadOnlyConfigError);
    expect(s.local.set).not.toHaveBeenCalled();
    expect(s.sync.set).not.toHaveBeenCalled();
    expect((await s.repo.load()).variables[0]?.value).toBe('x');
  });
});
