import { hasExpressions, resolveValue, type ExpressionContext } from '../../../core/expressions';
import type { Variable } from '../../../core/model';
import { t } from '../../../core/i18n';

export const FALLBACK_EXAMPLE_URL = 'https://exemplo.com/';

export function parseExampleUrl(text: string): URL | null {
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
}

/** Primeiro padrão de URL com `*` trocado por "exemplo" (ou uma URL genérica). */
export function defaultExampleUrl(patterns: readonly string[]): string {
  const first = patterns.map((p) => p.trim()).find((p) => p !== '');
  if (!first) return FALLBACK_EXAMPLE_URL;
  const candidate = first.replace(/^\*:\/\//, 'https://').replace(/\*/g, 'exemplo');
  return parseExampleUrl(candidate) ? candidate : FALLBACK_EXAMPLE_URL;
}

export interface PreviewOptions {
  variables: readonly Variable[];
  /** Texto da URL de exemplo; se inválida, usa a genérica. */
  exampleUrl: string;
  now?: Date;
}

/** Contexto de preview: variáveis salvas, URL de exemplo e marcadores para o que só existe na página. */
export function buildPreviewContext(opts: PreviewOptions): ExpressionContext {
  return {
    variables: Object.fromEntries(opts.variables.map((v) => [v.key, v.value])),
    url: parseExampleUrl(opts.exampleUrl) ?? new URL(FALLBACK_EXAMPLE_URL),
    now: opts.now ?? new Date(),
    field: (label) => t('previewField', label),
    text: (selector) => t('previewText', selector),
  };
}

export type PreviewResult =
  { kind: 'none' } | { kind: 'ok'; value: string } | { kind: 'warn'; message: string };

/**
 * Resolve o valor para a pré-visualização. Sem `{{ }}` não há resultado. Erro de sintaxe vira
 * aviso aqui também (a validação do campo continua sendo quem bloqueia o salvar).
 */
export function previewValue(template: string, opts: PreviewOptions): PreviewResult {
  if (!hasExpressions(template)) return { kind: 'none' };
  const r = resolveValue(template, buildPreviewContext(opts));
  return r.ok ? { kind: 'ok', value: r.value } : { kind: 'warn', message: r.error };
}
