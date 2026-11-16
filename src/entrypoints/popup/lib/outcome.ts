import type { FieldOutcome, RunReport } from '../../../core/model';
import { summarize } from '../../../core/model';
import { t } from '../../../core/i18n';

export type OutcomeTone = 'ok' | 'neutral' | 'warn' | 'error';

const TONES: Record<FieldOutcome, OutcomeTone> = {
  filled: 'ok',
  'skipped-not-default': 'neutral',
  'skipped-already-handled': 'neutral',
  'skipped-disabled': 'neutral',
  'skipped-unresolved-value': 'warn',
  'not-found': 'warn',
  undone: 'neutral',
  error: 'error',
};

const ICONS: Record<FieldOutcome, string> = {
  filled: '✓',
  'skipped-not-default': '–',
  'skipped-already-handled': '–',
  'skipped-disabled': '–',
  'skipped-unresolved-value': '!',
  'not-found': '?',
  undone: '↺',
  error: '✕',
};

export function outcomeLabel(o: FieldOutcome): string {
  switch (o) {
    case 'filled':
      return t('popOutFilled');
    case 'skipped-not-default':
      return t('popOutNotDefault');
    case 'skipped-already-handled':
      return t('popOutHandled');
    case 'skipped-disabled':
      return t('popOutDisabled');
    case 'skipped-unresolved-value':
      return t('popOutUnresolved');
    case 'not-found':
      return t('popOutNotFound');
    case 'undone':
      return t('popOutUndone');
    case 'error':
      return t('popOutError');
  }
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
  const base = t('toastSummary', s.filled, s.skipped, s.notFound, s.errors);
  return s.undone > 0 ? `${base} · ${t('popSummaryUndone', s.undone)}` : base;
}

export function modeLabel(mode: 'auto' | 'button' | 'off'): string {
  return mode === 'auto' ? t('modeAuto') : mode === 'button' ? t('modeButton') : t('modeOff');
}

export function hasFilled(r: RunReport | null): boolean {
  return r !== null && r.fields.some((f) => f.outcome === 'filled');
}
