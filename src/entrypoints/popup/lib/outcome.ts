import type { FieldOutcome, RunReport } from '../../../core/model';
import { summarize } from '../../../core/model';

const LABELS: Record<FieldOutcome, string> = {
  filled: 'Preenchido',
  'skipped-not-default': 'Ignorado: já tinha valor',
  'skipped-already-handled': 'Já tratado nesta abertura',
  'skipped-disabled': 'Desativado',
  'skipped-unresolved-value': 'Valor não resolvido',
  'not-found': 'Não encontrado',
  error: 'Erro',
};

export type OutcomeTone = 'ok' | 'neutral' | 'warn' | 'error';

const TONES: Record<FieldOutcome, OutcomeTone> = {
  filled: 'ok',
  'skipped-not-default': 'neutral',
  'skipped-already-handled': 'neutral',
  'skipped-disabled': 'neutral',
  'skipped-unresolved-value': 'warn',
  'not-found': 'warn',
  error: 'error',
};

const ICONS: Record<FieldOutcome, string> = {
  filled: '✓',
  'skipped-not-default': '–',
  'skipped-already-handled': '–',
  'skipped-disabled': '–',
  'skipped-unresolved-value': '!',
  'not-found': '?',
  error: '✕',
};

export function outcomeLabel(o: FieldOutcome): string {
  return LABELS[o];
}
export function outcomeTone(o: FieldOutcome): OutcomeTone {
  return TONES[o];
}
export function outcomeIcon(o: FieldOutcome): string {
  return ICONS[o];
}

/** "2 preenchidos · 1 ignorados · 0 não encontrados · 0 erros" */
export function formatSummary(r: RunReport): string {
  const s = summarize(r);
  return `${s.filled} preenchidos · ${s.skipped} ignorados · ${s.notFound} não encontrados · ${s.errors} erros`;
}

export function modeLabel(mode: 'auto' | 'button' | 'off'): string {
  return mode === 'auto' ? 'Automático' : mode === 'button' ? 'Com um clique' : 'Desligado';
}

export function hasFilled(r: RunReport | null): boolean {
  return r !== null && r.fields.some((f) => f.outcome === 'filled');
}
