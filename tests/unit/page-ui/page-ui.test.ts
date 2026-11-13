import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunReport } from '../../../src/core/model';
import {
  ACTION_HOST_ATTR,
  TOAST_HOST_ATTR,
  createPageUi,
} from '../../../src/entrypoints/content/page-ui';

const report = (outcome: 'filled' | 'undone' = 'filled'): RunReport => ({
  ruleId: 'r1',
  ruleName: 'Regra',
  url: 'https://x',
  startedAt: '2026-11-13T00:00:00.000Z',
  origin: 'auto',
  fields: [
    { fieldId: 'a', description: 'A', outcome, previousValue: null },
    { fieldId: 'b', description: 'B', outcome, previousValue: null },
  ],
});

const shadowOf = (attr: string) =>
  document.querySelector(`[${attr}]`)?.shadowRoot as ShadowRoot | undefined;

describe('page-ui', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('botão aparece, clique chama callback sem propagar, e some', () => {
    const ui = createPageUi();
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    const cb = vi.fn();
    ui.showActionButton('r1', 'Preencher: Regra', cb);
    const btn = shadowOf(ACTION_HOST_ATTR)?.querySelector('button');
    expect(btn?.textContent).toBe('Preencher: Regra');
    expect(btn?.getAttribute('aria-label')).toBe('Preencher: Regra');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(docClick).not.toHaveBeenCalled();
    ui.hideActionButton('r1');
    expect(document.querySelector(`[${ACTION_HOST_ATTR}]`)).toBeNull();
    document.removeEventListener('click', docClick);
  });

  it('múltiplos botões, um por regra', () => {
    const ui = createPageUi();
    ui.showActionButton('r1', 'Preencher: A', vi.fn());
    ui.showActionButton('r2', 'Preencher: B', vi.fn());
    const texts = [...(shadowOf(ACTION_HOST_ATTR)?.querySelectorAll('button') ?? [])].map(
      (b) => b.textContent,
    );
    expect(texts).toEqual(['Preencher: A', 'Preencher: B']);
    ui.hideActionButton('r1');
    expect(shadowOf(ACTION_HOST_ATTR)?.querySelectorAll('button')).toHaveLength(1);
    ui.hideActionButton('r2');
    expect(document.querySelector(`[${ACTION_HOST_ATTR}]`)).toBeNull();
  });

  it('toast com Desfazer chama o callback e não propaga o click', () => {
    const ui = createPageUi();
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    const undo = vi.fn();
    ui.showReport(report(), { undo });
    const btn = shadowOf(TOAST_HOST_ATTR)?.querySelector<HTMLButtonElement>('.undo');
    expect(btn?.textContent).toBe('Desfazer');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(docClick).not.toHaveBeenCalled();
    document.removeEventListener('click', docClick);
  });

  it('toast sem actions não tem Desfazer; relatório de desfazer diz "restaurados"', () => {
    const ui = createPageUi();
    ui.showReport(report());
    expect(shadowOf(TOAST_HOST_ATTR)?.querySelector('.undo')).toBeNull();
    ui.showReport(report('undone'));
    expect(shadowOf(TOAST_HOST_ATTR)?.querySelector('.summary')?.textContent).toContain(
      '2 campos restaurados',
    );
  });
});
