import { migrateConfig, type Config } from '../../../core/model';
import type { FieldOutcome, RunReport } from '../../../core/model';
import { summarize, variableScope } from '../../../core/model';
import { t, uiLocale } from '../../../core/i18n';

const pad = (n: number): string => String(n).padStart(2, '0');

/** AAAA-MM-DD no fuso local. */
export function localDateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function exportFileName(d: Date): string {
  return `assistente-config-${localDateStamp(d)}.json`;
}

export interface ExportOptions {
  /** Inclui os valores das variáveis "só neste navegador". Padrão: não (saem com value ''). */
  includeLocalValues?: boolean;
}

export function exportJson(config: Config, opts: ExportOptions = {}): string {
  const out: Config = opts.includeLocalValues
    ? config
    : {
        ...config,
        variables: config.variables.map((v) =>
          variableScope(v) === 'local' ? { ...v, value: '' } : v,
        ),
      };
  return `${JSON.stringify(out, null, 2)}\n`;
}

export type ImportParse =
  { ok: true; config: Config; warnings: string[] } | { ok: false; error: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Lê o texto de um arquivo exportado. Nunca lança; em caso de erro, nada deve ser gravado. */
export function parseImport(text: string): ImportParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: t('impInvalidJson') };
  }
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    return {
      ok: false,
      error: t('impNotConfig'),
    };
  }
  const { config, warnings, readOnly } = migrateConfig(raw);
  if (readOnly) {
    return {
      ok: false,
      error: t('impNewerVersion'),
    };
  }
  const rawRules = Array.isArray(raw.rules) ? raw.rules.length : 0;
  if (rawRules > 0 && config.rules.length === 0) {
    return {
      ok: false,
      error: t('impNoValidRules', warnings.join(' ')).trim(),
    };
  }
  if (warnings.some((w) => w.includes(t('migEmptyMarker')))) {
    return { ok: false, error: warnings.join(' ') };
  }
  return { ok: true, config, warnings };
}

// ---------------------------------------------------------------- histórico

const dateTime = () =>
  new Intl.DateTimeFormat(uiLocale(), { dateStyle: 'short', timeStyle: 'medium' });

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime().format(d);
}

/** Só host + caminho, sem query nem fragmento. */
export function urlHostPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

/** Rótulos por resultado; getters: o texto sai no idioma da hora da leitura. */
export const OUTCOME_LABELS: Record<FieldOutcome, string> = {
  get filled() {
    return t('histFilled');
  },
  get 'skipped-not-default'() {
    return t('histSkippedNotDefault');
  },
  get 'skipped-already-handled'() {
    return t('histSkippedHandled');
  },
  get 'skipped-disabled'() {
    return t('histSkippedDisabled');
  },
  get 'skipped-unresolved-value'() {
    return t('histSkippedUnresolved');
  },
  get 'not-found'() {
    return t('histNotFound');
  },
  get undone() {
    return t('popOutUndone');
  },
  get error() {
    return t('popOutError');
  },
};

export function summaryText(report: RunReport): string {
  const s = summarize(report);
  const parts: string[] = [];
  if (s.filled) parts.push(s.filled === 1 ? t('sumFilledOne') : t('sumFilledMany', s.filled));
  if (s.undone) parts.push(s.undone === 1 ? t('sumUndoneOne') : t('sumUndoneMany', s.undone));
  if (s.skipped) parts.push(s.skipped === 1 ? t('sumSkippedOne') : t('sumSkippedMany', s.skipped));
  if (s.notFound)
    parts.push(s.notFound === 1 ? t('sumNotFoundOne') : t('sumNotFoundMany', s.notFound));
  if (s.errors) parts.push(s.errors === 1 ? t('sumErrorOne') : t('sumErrorMany', s.errors));
  return parts.length > 0 ? parts.join(', ') : t('sumNoField');
}
