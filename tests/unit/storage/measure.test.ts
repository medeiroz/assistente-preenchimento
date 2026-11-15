import { describe, expect, it } from 'vitest';
import {
  MAX_ITEM_BYTES,
  SYNC_QUOTA_BYTES,
  StorageQuotaError,
  createChromeSyncRepository,
  measureConfig,
  measureItem,
  measureRule,
  measureVariables,
  ruleItemKey,
  type StorageAreaLike,
} from '../../../src/core/storage';
import { emptyConfig, type Rule, type Variable } from '../../../src/core/model';

function area(): StorageAreaLike {
  const data = new Map<string, unknown>();
  return {
    async get(keys) {
      const list = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}

function bigRule(n: number): Rule {
  return {
    id: 'grande',
    name: 'Grande',
    enabled: true,
    trigger: { urlPatterns: ['https://exemplo.com/*'], settleMs: 300 },
    behavior: { mode: 'auto', overwrite: 'onlyIfDefault', refill: 'oncePerAppearance' },
    fields: [
      {
        id: 'f1',
        enabled: true,
        locator: { by: 'name', name: 'campo' },
        adapter: 'auto',
        value: 'x'.repeat(n),
      },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Rule;
}

describe('measureItem', () => {
  it('conta chave + valor em JSON, em bytes UTF-8', () => {
    expect(measureItem('ab', 'é')).toBe(4 + 4);
    expect(ruleItemKey('r1')).toBe('rule:r1');
  });

  it('é o mesmo número que o erro de quota reporta', async () => {
    const rule = bigRule(9000);
    const repo = createChromeSyncRepository({
      sync: area(),
      local: area(),
      onChanged: () => () => undefined,
    });
    const bytes = measureRule(rule);
    expect(bytes).toBeGreaterThan(MAX_ITEM_BYTES);
    // updatedAt tem tamanho fixo, então a medida antes de salvar é a mesma
    const err = await repo.saveRule(rule).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageQuotaError);
    expect((err as Error).message).toContain(`${(bytes / 1024).toFixed(1)} KB de 8 KB`);
  });

  it('variáveis: valores locais não entram na medida', () => {
    const sync: Variable[] = [{ key: 'a', label: '', value: 'v' }];
    const withLocal: Variable[] = [
      ...sync,
      { key: 'seg', label: '', value: 'y'.repeat(5000), scope: 'local' },
    ];
    const withoutValue: Variable[] = [
      ...sync,
      { key: 'seg', label: '', value: '', scope: 'local' },
    ];
    expect(measureVariables(withLocal)).toBe(measureVariables(withoutValue));
    expect(measureVariables(withLocal)).toBeLessThan(500);
  });

  it('measureConfig soma os itens e cabe na cota', () => {
    const cfg = emptyConfig();
    cfg.rules = [bigRule(10)];
    expect(measureConfig(cfg)).toBeGreaterThan(measureRule(cfg.rules[0]));
    expect(measureConfig(cfg)).toBeLessThan(SYNC_QUOTA_BYTES);
  });
});
