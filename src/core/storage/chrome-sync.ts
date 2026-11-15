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
  type Variable,
  variableScope,
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
  /** storage.local: valores das variáveis "só neste navegador". */
  local: StorageAreaLike;
  onChanged: (cb: (changes: StorageChanges, area: string) => void) => () => void;
}

export class ReadOnlyConfigError extends Error {
  constructor() {
    super(
      'Esta configuração foi salva por uma versão mais nova da extensão. Atualize a extensão para editar.',
    );
    this.name = 'ReadOnlyConfigError';
  }
}

export interface ChromeSyncRepository extends ConfigRepository {
  /** true se já existe 'cfg:meta' (instalação marcada), mesmo sem regras. */
  isInitialized(): Promise<boolean>;
}

/** Limite do chrome.storage.sync por item. */
export const MAX_ITEM_BYTES = 8192;
/** Cota total do chrome.storage.sync. */
export const SYNC_QUOTA_BYTES = 102400;
const DEBOUNCE_MS = 50;

const META_KEY = 'cfg:meta';
const SETTINGS_KEY = 'cfg:settings';
const VARIABLES_KEY = 'cfg:variables';
const RULE_PREFIX = 'rule:';
/** Chave em storage.local: objeto `{ [chave da variável]: valor }` das variáveis locais. */
export const LOCAL_VARS_KEY = 'vars:local';

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

/** Bytes que o item ocupa no storage.sync (chave + valor em JSON), como o Chrome conta. */
export function measureItem(key: string, value: unknown): number {
  const enc = new TextEncoder();
  return enc.encode(JSON.stringify(key)).length + enc.encode(JSON.stringify(value)).length;
}

/** Chave do item de uma regra no storage.sync. */
export function ruleItemKey(id: string): string {
  return RULE_PREFIX + id;
}

/** Tamanho que a regra terá ao ser gravada (a data de atualização tem tamanho fixo). */
export function measureRule(rule: unknown): number {
  const id = isRecord(rule) && typeof rule.id === 'string' ? rule.id : '';
  return measureItem(ruleItemKey(id), rule);
}

/** Tamanho do item de variáveis como será gravado: as locais entram com `value: ''`. */
export function measureVariables(vars: Variable[]): number {
  return measureItem(VARIABLES_KEY, splitVariables(vars, {}, false).syncVars);
}

/** Bytes que a configuração ocupa no storage.sync (itens que `replaceAll` gravaria). */
export function measureConfig(config: Config): number {
  let total = measureVariables(config.variables) + measureItem(SETTINGS_KEY, config.settings);
  total += measureItem(
    META_KEY,
    nextMeta(
      undefined,
      config.rules.map((r) => r.id),
    ),
  );
  for (const r of config.rules) total += measureRule(r);
  return total;
}

function assertFits(key: string, value: unknown, what: string): void {
  const bytes = measureItem(key, value);
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

/** true se o índice foi gravado por uma versão mais nova do esquema (somente leitura). */
function isNewerMeta(meta: unknown): boolean {
  return (
    isRecord(meta) &&
    typeof meta.schemaVersion === 'number' &&
    Number.isInteger(meta.schemaVersion) &&
    meta.schemaVersion > CURRENT_SCHEMA_VERSION
  );
}

/** Índice atualizado preservando chaves desconhecidas que uma versão futura tenha gravado. */
function nextMeta(existing: unknown, ruleIds: string[]): Record<string, unknown> {
  return {
    ...(isRecord(existing) ? existing : {}),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ruleIds,
  };
}

function parseRuleIds(meta: unknown): string[] {
  if (!isRecord(meta) || !Array.isArray(meta.ruleIds)) return [];
  return meta.ruleIds.filter((x): x is string => typeof x === 'string');
}

function parseLocalValues(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

/**
 * Separa as variáveis na parte que vai para o sync (locais com `value: ''`) e nos valores que
 * ficam em storage.local. `keepExisting`: variável local sem valor mantém o valor local atual.
 */
function splitVariables(
  vars: Variable[],
  existingLocal: Record<string, string>,
  keepExisting: boolean,
): { syncVars: Variable[]; localValues: Record<string, string> } {
  const localValues: Record<string, string> = {};
  const syncVars = vars.map((v) => {
    if (variableScope(v) !== 'local') return v;
    if (v.value !== '') localValues[v.key] = v.value;
    else if (keepExisting && existingLocal[v.key] !== undefined) {
      localValues[v.key] = existingLocal[v.key] as string;
    }
    return { ...v, value: '' };
  });
  return { syncVars, localValues };
}

export function createChromeSyncRepository(deps: ChromeSyncDeps): ChromeSyncRepository {
  const { sync, local } = deps;

  async function readLocalValues(): Promise<Record<string, string>> {
    return parseLocalValues((await local.get(LOCAL_VARS_KEY))[LOCAL_VARS_KEY]);
  }

  /**
   * Grava as variáveis: primeiro a união dos valores locais (nada se perde se o passo seguinte
   * falhar), depois o sync e, por fim, os valores locais finais (sem as chaves que saíram).
   */
  async function writeVariables(
    localValues: Record<string, string>,
    existingLocal: Record<string, string>,
    syncWrite: () => Promise<void>,
  ): Promise<void> {
    if (Object.keys(existingLocal).length === 0 && Object.keys(localValues).length === 0) {
      await syncWrite();
      return;
    }
    await local.set({ [LOCAL_VARS_KEY]: { ...existingLocal, ...localValues } });
    await syncWrite();
    if (Object.keys(localValues).length === 0) await local.remove(LOCAL_VARS_KEY);
    else if (Object.keys(existingLocal).some((k) => !(k in localValues))) {
      await local.set({ [LOCAL_VARS_KEY]: localValues });
    }
  }

  // Serializa escritas para que o read-modify-write de ruleIds não se perca.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Lê o índice e recusa a escrita se a configuração armazenada é de versão mais nova. */
  async function readMetaForWrite(): Promise<unknown> {
    const got = await sync.get(META_KEY);
    if (isNewerMeta(got[META_KEY])) throw new ReadOnlyConfigError();
    return got[META_KEY];
  }

  async function loadState(): Promise<{ config: Config; readOnly: boolean }> {
    const all = await sync.get(null);
    const localValues = await readLocalValues();
    const meta = all[META_KEY];
    if (!isRecord(meta)) return { config: emptyConfig(), readOnly: false };
    const ids = parseRuleIds(meta);
    const raw = {
      schemaVersion: meta.schemaVersion,
      settings: all[SETTINGS_KEY],
      variables: all[VARIABLES_KEY],
      rules: ids.map((id) => all[RULE_PREFIX + id]).filter((r) => r !== undefined),
    };
    const { config, warnings, readOnly } = migrateConfig(raw);
    for (const w of warnings) console.warn('[assistente]', w);
    const variables = config.variables.map((v) =>
      variableScope(v) === 'local' ? { ...v, value: localValues[v.key] ?? '' } : v,
    );
    return { config: { ...config, variables }, readOnly: readOnly === true };
  }

  return {
    async load() {
      return (await loadState()).config;
    },

    async isReadOnly() {
      const got = await sync.get(META_KEY);
      return isNewerMeta(got[META_KEY]);
    },

    async isInitialized() {
      const got = await sync.get(META_KEY);
      return got[META_KEY] !== undefined;
    },

    saveRule(rule) {
      return serial(async () => {
        await readMetaForWrite();
        const parsed = RuleSchema.safeParse(rule);
        if (!parsed.success) {
          throw new Error(`Regra inválida: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        const valid: Rule = { ...parsed.data, updatedAt: new Date().toISOString() };
        const key = ruleItemKey(valid.id);
        assertFits(key, valid, 'Regra');
        const meta = await readMetaForWrite();
        const ids = parseRuleIds(meta);
        const nextIds = ids.includes(valid.id) ? ids : [...ids, valid.id];
        await sync.set({ [key]: valid, [META_KEY]: nextMeta(meta, nextIds) });
      });
    },

    deleteRule(id) {
      return serial(async () => {
        const meta = await readMetaForWrite();
        const ids = parseRuleIds(meta);
        await sync.remove(RULE_PREFIX + id);
        if (ids.includes(id)) {
          await sync.set({
            [META_KEY]: nextMeta(
              meta,
              ids.filter((x) => x !== id),
            ),
          });
        }
      });
    },

    saveVariables(vars) {
      return serial(async () => {
        await readMetaForWrite();
        const parsed = ConfigSchema.shape.variables.safeParse(vars);
        if (!parsed.success) {
          throw new Error(`Variáveis inválidas: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        const existingLocal = await readLocalValues();
        const { syncVars, localValues } = splitVariables(parsed.data, existingLocal, false);
        assertFits(VARIABLES_KEY, syncVars, 'Variáveis');
        await writeVariables(localValues, existingLocal, () =>
          sync.set({ [VARIABLES_KEY]: syncVars }),
        );
      });
    },

    saveSettings(settings) {
      return serial(async () => {
        await readMetaForWrite();
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
        await readMetaForWrite();
        const parsed = ConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new Error(`Configuração inválida: ${formatZodIssues(parsed.error).join('; ')}`);
        }
        const cfg = parsed.data;
        const items: Record<string, unknown> = {};
        for (const r of cfg.rules) {
          const key = ruleItemKey(r.id);
          assertFits(key, r, 'Regra');
          items[key] = r;
        }
        const ruleIds = cfg.rules.map((r) => r.id);
        const existingLocal = await readLocalValues();
        // Importação: variável local sem valor no arquivo mantém o valor local deste navegador.
        const { syncVars, localValues } = splitVariables(cfg.variables, existingLocal, true);
        items[VARIABLES_KEY] = syncVars;
        items[SETTINGS_KEY] = cfg.settings;
        const existing = await sync.get(null);
        items[META_KEY] = {
          ...nextMeta(existing[META_KEY], ruleIds),
          schemaVersion: cfg.schemaVersion,
        };
        assertFits(VARIABLES_KEY, syncVars, 'Variáveis');
        assertFits(SETTINGS_KEY, cfg.settings, 'Preferências');
        assertFits(META_KEY, items[META_KEY], 'Índice de regras');

        const stale = Object.keys(existing).filter(
          (k) => k.startsWith(RULE_PREFIX) && !ruleIds.includes(k.slice(RULE_PREFIX.length)),
        );
        await writeVariables(localValues, existingLocal, async () => {
          await sync.set(items);
          if (stale.length > 0) await sync.remove(stale);
        });
      });
    },

    onChange(cb) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = deps.onChanged((changes, area) => {
        if (area === 'local') {
          if (!(LOCAL_VARS_KEY in changes)) return;
        } else if (area !== 'sync' || !Object.keys(changes).some(isRelevantKey)) return;
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = undefined;
          loadState().then(
            ({ config, readOnly }) => cb(config, { readOnly }),
            (e: unknown) => console.warn('[assistente] falha ao recarregar', e),
          );
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
    local: browser.storage.local as unknown as StorageAreaLike,
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
