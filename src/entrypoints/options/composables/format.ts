import { migrateConfig, type Config } from '../../../core/model';
import type { FieldOutcome, RunReport } from '../../../core/model';
import { summarize, variableScope } from '../../../core/model';

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
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    return {
      ok: false,
      error: 'O arquivo não parece ser uma configuração exportada por este assistente.',
    };
  }
  const { config, warnings, readOnly } = migrateConfig(raw);
  if (readOnly) {
    return {
      ok: false,
      error:
        'Este arquivo foi exportado por uma versão mais nova da extensão. Atualize a extensão para importá-lo.',
    };
  }
  const rawRules = Array.isArray(raw.rules) ? raw.rules.length : 0;
  if (rawRules > 0 && config.rules.length === 0) {
    return {
      ok: false,
      error: `Nenhuma regra do arquivo é válida. ${warnings.join(' ')}`.trim(),
    };
  }
  if (warnings.some((w) => w.includes('usando configuração vazia'))) {
    return { ok: false, error: warnings.join(' ') };
  }
  return { ok: true, config, warnings };
}

// ---------------------------------------------------------------- histórico

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_TIME.format(d);
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

export const OUTCOME_LABELS: Record<FieldOutcome, string> = {
  filled: 'Preenchido',
  'skipped-not-default': 'Pulado: o campo já tinha valor',
  'skipped-already-handled': 'Pulado: já tratado antes',
  'skipped-disabled': 'Pulado: campo desligado',
  'skipped-unresolved-value': 'Pulado: valor não resolvido',
  'not-found': 'Campo não encontrado',
  undone: 'Desfeito',
  error: 'Erro',
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function summaryText(report: RunReport): string {
  const s = summarize(report);
  const parts: string[] = [];
  if (s.filled) parts.push(plural(s.filled, 'preenchido', 'preenchidos'));
  if (s.undone) parts.push(plural(s.undone, 'desfeito', 'desfeitos'));
  if (s.skipped) parts.push(plural(s.skipped, 'pulado', 'pulados'));
  if (s.notFound) parts.push(plural(s.notFound, 'não encontrado', 'não encontrados'));
  if (s.errors) parts.push(plural(s.errors, 'erro', 'erros'));
  return parts.length > 0 ? parts.join(', ') : 'nenhum campo';
}
