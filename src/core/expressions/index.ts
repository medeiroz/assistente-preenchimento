import { resolveTemplate } from './evaluate';
import { FILTER_NAMES as FILTER_NAMES_INTERNAL } from './filters';
import { parseTemplate, templateHasBlocks } from './parser';
import { ExpressionError } from './types';
import type { ExpressionContext, ResolveResult, ValidateResult } from './types';
import { t } from '../i18n';

export type { ExpressionContext, ResolveResult, ValidateResult };

/** Nomes dos filtros disponíveis (para autocomplete na UI). */
export const FILTER_NAMES: readonly string[] = FILTER_NAMES_INTERNAL;

/** Resolve um template com blocos `{{ ... }}`. Nunca lança por erro de usuário. */
export function resolveValue(template: string, ctx: ExpressionContext): ResolveResult {
  return resolveTemplate(template, ctx);
}

/** Indica se o template contém ao menos um bloco `{{` (não escapado). */
export function hasExpressions(template: string): boolean {
  return templateHasBlocks(template);
}

/** Valida só a sintaxe (fontes, filtros, aridade), sem contexto. Para o editor. */
export function validateTemplate(template: string): ValidateResult {
  try {
    parseTemplate(template);
    return { ok: true };
  } catch (e) {
    if (e instanceof ExpressionError) {
      return { ok: false, error: t('exWithPosition', e.message, e.position), position: e.position };
    }
    throw e;
  }
}
