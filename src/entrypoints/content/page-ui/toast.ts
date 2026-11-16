import { summarize } from '../../../core/model';
import type { FieldOutcome, RunReport } from '../../../core/model';

import { isolateEvents } from './shared';
import { t } from '../../../core/i18n';

export const TOAST_HOST_ATTR = 'data-assistente-preenchimento';
export const TOAST_DURATION_MS = 6000;

function outcomeLabel(outcome: FieldOutcome): string {
  switch (outcome) {
    case 'filled':
      return t('outFilled');
    case 'skipped-not-default':
      return t('outSkippedNotDefault');
    case 'skipped-already-handled':
      return t('outSkippedHandled');
    case 'skipped-disabled':
      return t('outSkippedDisabled');
    case 'skipped-unresolved-value':
      return t('outSkippedUnresolved');
    case 'not-found':
      return t('outNotFound');
    case 'undone':
      return t('outUndone');
    case 'error':
      return t('outError');
  }
}

const STYLE = `
:host { all: initial; }
.toast {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 320px; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 12px 14px; border-radius: 8px;
  background: #1f2937; color: #f9fafb;
  font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.head { display: flex; align-items: flex-start; gap: 8px; }
.title { flex: 1; font-weight: 600; }
.close { all: unset; cursor: pointer; padding: 0 4px; font-size: 16px; line-height: 1; opacity: 0.8; }
.close:hover { opacity: 1; }
.close:focus-visible, summary:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
.summary { margin-top: 4px; color: #d1d5db; }
details { margin-top: 6px; }
summary { cursor: pointer; color: #93c5fd; }
ul { margin: 6px 0 0; padding: 0; list-style: none; }
li { margin: 2px 0; color: #e5e7eb; }
li.error, li.not-found { color: #fca5a5; }
.actions { margin-top: 8px; }
.undo {
  all: unset; cursor: pointer; padding: 4px 10px; border-radius: 6px;
  background: #374151; color: #f9fafb; font-weight: 600;
}
.undo:hover { background: #4b5563; }
.undo:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
`;

function buildToast(report: RunReport, onClose: () => void, onUndo?: () => void): HTMLElement {
  const s = summarize(report);
  const box = document.createElement('div');
  box.className = 'toast';
  // Erros interrompem (alert); o resumo normal é anunciado com educação (status, polite).
  const failed = s.errors > 0 || s.notFound > 0;
  box.setAttribute('role', failed ? 'alert' : 'status');
  box.setAttribute('aria-live', failed ? 'assertive' : 'polite');
  box.setAttribute('aria-atomic', 'true');

  const head = document.createElement('div');
  head.className = 'head';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = t('toastTitle', report.ruleName);
  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.setAttribute('aria-label', t('close'));
  close.textContent = '×';
  close.addEventListener('click', onClose);
  head.append(title, close);

  const summary = document.createElement('div');
  summary.className = 'summary';
  const restored = s.undone;
  summary.textContent =
    restored > 0
      ? restored === 1
        ? t('toastRestoredOne', s.errors)
        : t('toastRestoredMany', restored, s.errors)
      : t('toastSummary', s.filled, s.skipped, s.notFound, s.errors);

  const details = document.createElement('details');
  const dsum = document.createElement('summary');
  dsum.textContent = t('toastDetails');
  const list = document.createElement('ul');
  for (const f of report.fields) {
    const li = document.createElement('li');
    li.className = f.outcome;
    const msg = f.message ? ` (${f.message})` : '';
    li.textContent = `${f.description} → ${outcomeLabel(f.outcome)}${msg}`;
    list.append(li);
  }
  details.append(dsum, list);

  box.append(head, summary, details);
  if (onUndo) {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const undo = document.createElement('button');
    undo.className = 'undo';
    undo.type = 'button';
    undo.setAttribute('aria-label', t('toastUndoAria'));
    undo.textContent = t('toastUndo');
    undo.addEventListener('click', onUndo);
    actions.append(undo);
    box.append(actions);
  }
  return box;
}

export interface ToastController {
  show(report: RunReport, actions?: { undo?: () => void }): void;
  dismiss(): void;
}

export function createToast(): ToastController {
  let host: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function dismiss(): void {
    clearTimer();
    host?.remove();
    host = null;
  }

  function arm(): void {
    clearTimer();
    timer = setTimeout(dismiss, TOAST_DURATION_MS);
  }

  return {
    show(report, actions) {
      dismiss();
      const el = document.createElement('div');
      el.setAttribute(TOAST_HOST_ATTR, '');
      isolateEvents(el);
      const shadow = el.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = STYLE;
      const undo = actions?.undo;
      const box = buildToast(report, dismiss, undo ? () => undo() : undefined);
      box.addEventListener('mouseenter', clearTimer);
      box.addEventListener('mouseleave', arm);
      shadow.append(style, box);
      (document.body ?? document.documentElement).append(el);
      host = el;
      arm();
    },
    dismiss,
  };
}
