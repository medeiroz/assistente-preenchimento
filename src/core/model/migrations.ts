import {
  CURRENT_SCHEMA_VERSION,
  ConfigSchema,
  RuleSchema,
  SettingsSchema,
  VariableSchema,
  emptyConfig,
  formatZodIssues,
  type Config,
} from './schema';
import { t } from '../i18n';

/**
 * Migração da versão N para N+1, indexada por N. Vazio por enquanto
 * (a v1 é a primeira versão); a v2 registrará `1: (cfg) => ...`.
 */
export const migrations: Record<number, (cfg: unknown) => unknown> = {};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isEmpty(raw: unknown): boolean {
  return raw === undefined || raw === null || (isRecord(raw) && Object.keys(raw).length === 0);
}

export interface MigrateResult {
  config: Config;
  warnings: string[];
  /**
   * true quando a configuração foi salva por uma versão mais nova da extensão: o que foi
   * possível validar é carregado, mas nada deve ser gravado de volta (evita perder dados).
   */
  readOnly?: true;
}

function fallback(warning: string): MigrateResult {
  return { config: emptyConfig(), warnings: [warning] };
}

export function migrateConfig(raw: unknown): MigrateResult {
  if (isEmpty(raw)) return { config: emptyConfig(), warnings: [] };
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    return fallback(t('migNoSchemaVersion'));
  }

  let current: unknown = raw;
  let version = raw.schemaVersion;
  if (!Number.isInteger(version) || version < 1) {
    return fallback(t('migUnknownVersion', version));
  }
  const readOnly = version > CURRENT_SCHEMA_VERSION;
  const warnings: string[] = [];
  if (readOnly) {
    warnings.push(t('migNewerVersion', version, CURRENT_SCHEMA_VERSION));
    version = CURRENT_SCHEMA_VERSION;
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) {
      return fallback(t('migNoMigration', version));
    }
    current = step(current);
    version++;
  }

  const cfg = isRecord(current) ? current : {};

  const settings = SettingsSchema.safeParse(cfg.settings ?? {});
  if (!settings.success) {
    warnings.push(...formatZodIssues(settings.error).map((e) => t('migInvalidSettings', e)));
  }

  const variables: Config['variables'] = [];
  const seenKeys = new Set<string>();
  const rawVars: unknown[] = Array.isArray(cfg.variables) ? cfg.variables : [];
  rawVars.forEach((rv, i) => {
    const r = VariableSchema.safeParse(rv);
    if (!r.success) {
      warnings.push(t('migVarDiscarded', i + 1, formatZodIssues(r.error).join('; ')));
    } else if (seenKeys.has(r.data.key)) {
      warnings.push(t('migVarDuplicate', r.data.key));
    } else {
      seenKeys.add(r.data.key);
      variables.push(r.data);
    }
  });

  const rules: Config['rules'] = [];
  const seenIds = new Set<string>();
  const rawRules: unknown[] = Array.isArray(cfg.rules) ? cfg.rules : [];
  rawRules.forEach((rr, i) => {
    const r = RuleSchema.safeParse(rr);
    const label = isRecord(rr) && typeof rr.id === 'string' ? `"${rr.id}"` : `#${i + 1}`;
    if (!r.success) {
      warnings.push(t('migRuleDiscarded', label, formatZodIssues(r.error).join('; ')));
    } else if (seenIds.has(r.data.id)) {
      warnings.push(t('migRuleDuplicate', label));
    } else {
      seenIds.add(r.data.id);
      rules.push(r.data);
    }
  });

  const config = ConfigSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: settings.success ? settings.data : { pausedHosts: [] },
    variables,
    rules,
  });
  return readOnly ? { config, warnings, readOnly } : { config, warnings };
}
