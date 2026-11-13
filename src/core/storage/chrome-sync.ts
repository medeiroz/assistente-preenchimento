import {
  CURRENT_SCHEMA_VERSION,
  ConfigSchema,
  RuleSchema,
  SettingsSchema,
  emptyConfig,
  formatZodIssues,
  migrateConfig,
  type Config,
  type Rule,
} from '../model';
import type { ConfigRepository, Unsubscribe } from './types';

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export type StorageChanges = Record<string, { newValue?: unknown; oldValue?: unknown }>;

export interface ChromeSyncDeps {
  sync: StorageAreaLike;
  onChanged: (cb: (changes: StorageChanges, area: string) => void) => () => void;
}

export interface ChromeSyncRepository extends ConfigRepository {
  /** true se já existe 'cfg:meta' (instalação marcada), mesmo sem regras. */
  isInitialized(): Promise<boolean>;
}

/** Limite do chrome.storage.sync por item. */
export const MAX_ITEM_BYTES = 8192;
const DEBOUNCE_MS = 50;

const META_KEY = 'cfg:meta';
const SETTINGS_KEY = 'cfg:settings';
const VARIABLES_KEY = 'cfg:variables';
const RULE_PREFIX = 'rule:';

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

function itemBytes(key: string, value: unknown): number {
  const enc = new TextEncoder();
  return enc.encode(JSON.stringify(key)).length + enc.encode(JSON.stringify(value)).length;
}

function assertFits(key: string, value: unknown, what: string): void {
  const bytes = itemBytes(key, value);
  if (bytes > MAX_ITEM_BYTES) {
    const kb = (bytes / 1024).toFixed(1);
    throw new StorageQuotaError(
      `${what} muito grande para sincronizar (${kb} KB de 8 KB). Reduza o número de campos.`,
    );
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isRelevantKey(k: string): boolean {
  return k.startsWith('cfg:') || k.startsWith(RULE_PREFIX);
}

function parseRuleIds(meta: unknown): string[] {
  if (!isRecord(meta) || !Array.isArray(meta.ruleIds)) return [];
  return meta.ruleIds.filter((x): x is string => typeof x === 'string');
}

export function createChromeSyncRepository(deps: ChromeSyncDeps): ChromeSyncRepository {
  const { sync } = deps;
  // Serializa escritas para que o read-modify-write de ruleIds não se perca.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  }

  async function readRuleIds(): Promise<string[]> {
    const got = await sync.get(META_KEY);
    return parseRuleIds(got[META_KEY]);
  }

  async function load(): Promise<Config> {
    const all = await sync.get(null);
    const meta = all[META_KEY];
    if (!isRecord(meta)) return emptyConfig();
    const ids = parseRuleIds(meta);
    const raw = {
      schemaVersion: meta.schemaVersion,
      settings: all[SETTINGS_KEY],
      variables: all[VARIABLES_KEY],
      rules: ids.map((id) => all[RULE_PREFIX + id]).filter((r) => r !== undefined),
    };
    const { config, warnings } = migrateConfig(raw);
    for (const w of warnings) console.warn('[assistente]', w);
    return config;
  }

  return {
    load,

    async isInitialized() {
      const got = await sync.get(META_KEY);
      return got[META_KEY] !== undefined;
    },

    saveRule(rule) {
      return serial(async () => {
        const parsed = RuleSchema.safeParse(rule);
        if (!parsed.success) {
          throw new Error(`Regra inválida: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        const valid: Rule = { ...parsed.data, updatedAt: new Date().toISOString() };
        const key = RULE_PREFIX + valid.id;
        assertFits(key, valid, 'Regra');
        const ids = await readRuleIds();
        const nextIds = ids.includes(valid.id) ? ids : [...ids, valid.id];
        await sync.set({
          [key]: valid,
          [META_KEY]: { schemaVersion: CURRENT_SCHEMA_VERSION, ruleIds: nextIds },
        });
      });
    },

    deleteRule(id) {
      return serial(async () => {
        const ids = await readRuleIds();
        await sync.remove(RULE_PREFIX + id);
        if (ids.includes(id)) {
          await sync.set({
            [META_KEY]: {
              schemaVersion: CURRENT_SCHEMA_VERSION,
              ruleIds: ids.filter((x) => x !== id),
            },
          });
        }
      });
    },

    saveVariables(vars) {
      return serial(async () => {
        const parsed = ConfigSchema.shape.variables.safeParse(vars);
        if (!parsed.success) {
          throw new Error(`Variáveis inválidas: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        assertFits(VARIABLES_KEY, parsed.data, 'Variáveis');
        await sync.set({ [VARIABLES_KEY]: parsed.data });
      });
    },

    saveSettings(settings) {
      return serial(async () => {
        const parsed = SettingsSchema.safeParse(settings);
        if (!parsed.success) {
          throw new Error(`Preferências inválidas: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        assertFits(SETTINGS_KEY, parsed.data, 'Preferências');
        await sync.set({ [SETTINGS_KEY]: parsed.data });
      });
    },

    replaceAll(config) {
      return serial(async () => {
        const parsed = ConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new Error(`Configuração inválida: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        const cfg = parsed.data;
        const items: Record<string, unknown> = {};
        for (const r of cfg.rules) {
          const key = RULE_PREFIX + r.id;
          assertFits(key, r, 'Regra');
          items[key] = r;
        }
        const ruleIds = cfg.rules.map((r) => r.id);
        items[VARIABLES_KEY] = cfg.variables;
        items[SETTINGS_KEY] = cfg.settings;
        items[META_KEY] = { schemaVersion: cfg.schemaVersion, ruleIds };
        assertFits(VARIABLES_KEY, cfg.variables, 'Variáveis');
        assertFits(SETTINGS_KEY, cfg.settings, 'Preferências');
        assertFits(META_KEY, items[META_KEY], 'Índice de regras');

        const existing = await sync.get(null);
        const stale = Object.keys(existing).filter(
          (k) => k.startsWith(RULE_PREFIX) && !ruleIds.includes(k.slice(RULE_PREFIX.length)),
        );
        await sync.set(items);
        if (stale.length > 0) await sync.remove(stale);
      });
    },

    onChange(cb) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = deps.onChanged((changes, area) => {
        if (area !== 'sync') return;
        if (!Object.keys(changes).some(isRelevantKey)) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          load().then(cb, (e: unknown) => console.warn('[assistente] falha ao recarregar', e));
        }, DEBOUNCE_MS);
      });
      const unsubscribe: Unsubscribe = () => {
        off();
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };
      return unsubscribe;
    },
  };
}

/** Grava os presets na primeira instalação. Não faz nada se já existe configuração (mesmo vazia). */
export async function seedIfEmpty(repo: ChromeSyncRepository, presets: Rule[]): Promise<boolean> {
  if (await repo.isInitialized()) return false;
  const cfg = emptyConfig();
  cfg.rules = presets;
  await repo.replaceAll(cfg);
  return true;
}

export function chromeSyncDeps(): ChromeSyncDeps {
  return {
    sync: browser.storage.sync as unknown as StorageAreaLike,
    onChanged: (cb) => {
      const listener = (changes: StorageChanges, area: string): void => cb(changes, area);
      browser.storage.onChanged.addListener(listener);
      return () => browser.storage.onChanged.removeListener(listener);
    },
  };
}

export function chromeSyncRepository(): ChromeSyncRepository {
  return createChromeSyncRepository(chromeSyncDeps());
}
