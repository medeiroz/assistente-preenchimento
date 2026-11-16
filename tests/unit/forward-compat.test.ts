import { describe, expect, it, vi } from 'vitest';
import { parseRule, type Config, type Rule } from '../../src/core/model';
import {
  ReadOnlyConfigError,
  createChromeSyncRepository,
  type StorageAreaLike,
} from '../../src/core/storage';
import { createAdapterRegistry } from '../../src/core/adapters/registry';
import type { FieldAdapter } from '../../src/core/adapters/types';
import {
  adapterLabel,
  draftToRuleInput,
  isDirty,
  cloneDraft,
  ruleToDraft,
  validateDraft,
} from '../../src/entrypoints/options/composables/draft';
import { rowsToVariables } from '../../src/entrypoints/options/composables/variables';
import { planMerge } from '../../src/entrypoints/options/composables/merge';

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const set = vi.fn();
  const remove = vi.fn();
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const sync: StorageAreaLike = {
    async get(keys) {
      const out: Record<string, unknown> = {};
      const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (data.has(k)) out[k] = clone(data.get(k));
      return out;
    },
    async set(items) {
      set(items);
      for (const [k, v] of Object.entries(items)) data.set(k, clone(v));
    },
    async remove(keys) {
      remove(keys);
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
  return { data, sync, set, remove };
}

function futureRule(id: string, adapter = 'auto'): Record<string, unknown> {
  return {
    id,
    name: `Regra ${id}`,
    enabled: true,
    futureRule: { a: 1 },
    trigger: {
      urlPatterns: ['https://exemplo.com/*'],
      settleMs: 300,
      futureTrigger: 'x',
      container: { selector: '.c', futureContainer: true },
    },
    behavior: {
      mode: 'auto',
      overwrite: 'onlyIfDefault',
      refill: 'oncePerAppearance',
      futureBehavior: 2,
    },
    fields: [
      {
        id: 'f1',
        enabled: true,
        locator: { by: 'label', text: 'Nome', futureLocator: 'l' },
        adapter,
        value: 'a',
        futureField: [1, 2],
        typing: { keyDelayMs: 20, futureTyping: 'k' },
      },
      {
        id: 'f2',
        enabled: true,
        locator: { by: 'selector', css: '#x', futureLocator2: 1 },
        adapter: 'auto',
        value: 'b',
      },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function meta(ids: string[], schemaVersion = 1): Record<string, unknown> {
  return { schemaVersion, ruleIds: ids, futureMeta: 'm' };
}

function repoWith(initial: Record<string, unknown>) {
  const st = makeStorage(initial);
  const repo = createChromeSyncRepository({
    sync: st.sync,
    local: makeStorage({}).sync,
    onChanged: () => () => undefined,
  });
  return { st, repo };
}

function parse(raw: unknown): Rule {
  const r = parseRule(raw);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

describe('chaves desconhecidas', () => {
  it('sobrevivem a ler e salvar pelo repositório, em todos os níveis', async () => {
    const { st, repo } = repoWith({
      'cfg:meta': meta(['r1']),
      'cfg:settings': { pausedHosts: [], futureSetting: true },
      'cfg:variables': [{ key: 'a', label: 'A', value: '1', futureVar: 'v' }],
      'rule:r1': futureRule('r1'),
    });
    const cfg = await repo.load();
    const rule = cfg.rules[0]!;
    expect(rule.futureRule).toEqual({ a: 1 });
    await repo.saveRule({ ...rule, name: 'Renomeada' });
    const stored = st.data.get('rule:r1') as {
      name: string;
      futureRule: unknown;
      trigger: { futureTrigger: string; container: { futureContainer: boolean } };
      behavior: { futureBehavior: number };
      fields: {
        futureField: unknown;
        locator: { futureLocator: string; futureLocator2: number };
        typing: { futureTyping: string };
      }[];
    };
    expect(stored.name).toBe('Renomeada');
    expect(stored.futureRule).toEqual({ a: 1 });
    expect(stored.trigger.futureTrigger).toBe('x');
    expect(stored.trigger.container.futureContainer).toBe(true);
    expect(stored.behavior.futureBehavior).toBe(2);
    expect(stored.fields[0]!.futureField).toEqual([1, 2]);
    expect(stored.fields[0]!.locator.futureLocator).toBe('l');
    expect(stored.fields[0]!.typing.futureTyping).toBe('k');
    expect(stored.fields[1]!.locator.futureLocator2).toBe(1);
    expect(st.data.get('cfg:meta')).toMatchObject({ futureMeta: 'm', schemaVersion: 1 });

    await repo.saveVariables(cfg.variables);
    expect(st.data.get('cfg:variables')).toEqual([
      { key: 'a', label: 'A', value: '1', futureVar: 'v' },
    ]);
    await repo.saveSettings(cfg.settings);
    expect(st.data.get('cfg:settings')).toEqual({ pausedHosts: [], futureSetting: true });
  });

  it('o rascunho da UI preserva as chaves extras na ida e volta', () => {
    const rule = parse(futureRule('r1'));
    const draft = ruleToDraft(rule);
    const out = draftToRuleInput(draft, { now: new Date('2026-02-02T00:00:00.000Z') });
    const expected = { ...futureRule('r1'), updatedAt: '2026-02-02T00:00:00.000Z' };
    expect(out).toEqual(expected);
    const clone = cloneDraft(draft);
    expect(isDirty(draft, clone)).toBe(false);
    const v = validateDraft(clone);
    expect(v.ok).toBe(true);
    expect(v.rule?.futureRule).toEqual({ a: 1 });
    expect(v.rule?.fields[0]?.futureField).toEqual([1, 2]);
  });

  it('trocar o tipo de localizador descarta só as extras do localizador antigo', () => {
    const draft = ruleToDraft(parse(futureRule('r1')));
    const f = draft.fields[0]!;
    f.locatorBy = 'name';
    f.locatorExtra = undefined;
    const out = draftToRuleInput(draft) as unknown as { fields: { locator: object }[] };
    expect(out.fields[0]!.locator).toEqual({ by: 'name', name: 'Nome' });
  });

  it('variáveis e mesclagem preservam extras', () => {
    expect(
      rowsToVariables([
        { uid: 1, key: 'a', label: 'A', value: '1', scope: 'sync', extra: { futureVar: 1 } },
      ]),
    ).toEqual([{ key: 'a', label: 'A', value: '1', futureVar: 1 }]);
    const plan = planMerge(
      { rules: [], variables: [] },
      { rules: [parse(futureRule('r1'))], variables: [] },
    );
    expect(plan.rules[0]!.futureRule).toEqual({ a: 1 });
  });
});

describe('adaptador desconhecido', () => {
  it('não descarta a regra, mantém o id ao salvar e o editor o mostra', async () => {
    const { st, repo } = repoWith({
      'cfg:meta': meta(['r1']),
      'rule:r1': futureRule('r1', 'adaptador-do-futuro'),
    });
    const cfg: Config = await repo.load();
    expect(cfg.rules).toHaveLength(1);
    expect(cfg.rules[0]!.fields[0]!.adapter).toBe('adaptador-do-futuro');
    const draft = ruleToDraft(cfg.rules[0]!);
    expect(adapterLabel(draft.fields[0]!.adapter)).toBe('Desconhecido: adaptador-do-futuro');
    const v = validateDraft(draft);
    expect(v.ok).toBe(true);
    await repo.saveRule(v.rule!);
    const stored = st.data.get('rule:r1') as { fields: { adapter: string }[] };
    expect(stored.fields[0]!.adapter).toBe('adaptador-do-futuro');
  });

  it('adaptador vazio continua inválido', () => {
    expect(parseRule(futureRule('r1', '')).ok).toBe(false);
  });

  it('o registry resolve id desconhecido como auto', () => {
    const registry = createAdapterRegistry();
    const make = (id: FieldAdapter['id'], detects: boolean): FieldAdapter => ({
      id,
      detect: () => detects,
      read: () => null,
      isDefault: () => true,
      write: () => Promise.resolve(),
      verify: () => true,
    });
    registry.register(make('native-select', false), 80);
    registry.register(make('native-text', true), 10);
    const root = document.createElement('div');
    expect(registry.resolve(root, 'adaptador-do-futuro')?.id).toBe('native-text');
    expect(registry.resolve(root, 'auto')?.id).toBe('native-text');
    expect(registry.resolve(root, 'native-select')).toBeNull();
  });
});

describe('configuração de versão mais nova', () => {
  function newer() {
    return repoWith({
      'cfg:meta': meta(['r1', 'ruim'], 2),
      'cfg:settings': { pausedHosts: ['a.com'] },
      'cfg:variables': [],
      'rule:r1': futureRule('r1'),
      'rule:ruim': { id: 'ruim' },
    });
  }

  it('carrega o que valida e sinaliza somente leitura', async () => {
    const { repo } = newer();
    const cfg = await repo.load();
    expect(cfg.rules.map((r) => r.id)).toEqual(['r1']);
    expect(await repo.isReadOnly()).toBe(true);
  });

  it('recusa todas as escritas sem tocar no storage', async () => {
    const { st, repo } = newer();
    const cfg = await repo.load();
    const rule = cfg.rules[0]!;
    await expect(repo.saveRule(rule)).rejects.toBeInstanceOf(ReadOnlyConfigError);
    await expect(repo.deleteRule('r1')).rejects.toBeInstanceOf(ReadOnlyConfigError);
    await expect(repo.replaceAll(cfg)).rejects.toBeInstanceOf(ReadOnlyConfigError);
    await expect(repo.saveVariables([])).rejects.toBeInstanceOf(ReadOnlyConfigError);
    await expect(repo.saveSettings(cfg.settings)).rejects.toBeInstanceOf(ReadOnlyConfigError);
    expect(st.set).not.toHaveBeenCalled();
    expect(st.remove).not.toHaveBeenCalled();
    expect(st.data.get('rule:ruim')).toEqual({ id: 'ruim' });
  });

  it('versão atual não é somente leitura', async () => {
    const { repo } = repoWith({ 'cfg:meta': meta([]) });
    expect(await repo.isReadOnly()).toBe(false);
  });
});
