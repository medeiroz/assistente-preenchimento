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

  describe('menu com 3 ou mais regras', () => {
    const items = () => [
      ...(shadowOf(ACTION_HOST_ATTR)?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ];
    const trigger = () =>
      shadowOf(ACTION_HOST_ATTR)?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    const click = (el: Element | null | undefined) =>
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const setup = () => {
      const ui = createPageUi();
      const cbs = [vi.fn(), vi.fn(), vi.fn()];
      ui.showActionButton('a', 'Preencher: A', cbs[0] as () => void);
      ui.showActionButton('b', 'Preencher: B', cbs[1] as () => void);
      ui.showActionButton('c', 'Preencher: C', cbs[2] as () => void);
      return { ui, cbs };
    };

    it('3 botões viram um único "Preencher…" com menu fechado', () => {
      setup();
      const buttons = shadowOf(ACTION_HOST_ATTR)?.querySelectorAll('button') ?? [];
      expect(buttons).toHaveLength(1);
      expect(trigger()?.textContent).toBe('Preencher…');
      expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
      expect(items()).toHaveLength(0);
    });

    it('abre o menu e o item dispara o callback certo', () => {
      const { cbs } = setup();
      click(trigger());
      expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
      expect(shadowOf(ACTION_HOST_ATTR)?.querySelector('[role="menu"]')).not.toBeNull();
      expect(items().map((i) => i.textContent)).toEqual([
        'Preencher: A',
        'Preencher: B',
        'Preencher: C',
      ]);
      click(items()[1]);
      expect(cbs[1]).toHaveBeenCalledTimes(1);
      expect(cbs[0]).not.toHaveBeenCalled();
      expect(cbs[2]).not.toHaveBeenCalled();
      expect(items()).toHaveLength(0);
    });

    it('Esc fecha o menu', () => {
      setup();
      click(trigger());
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(items()).toHaveLength(0);
    });

    it('clicar fora fecha; clicar dentro do host não', () => {
      setup();
      click(trigger());
      click(document.body);
      expect(items()).toHaveLength(0);
      click(trigger());
      expect(items()).toHaveLength(3);
    });

    it('teclado: seta para baixo abre e foca o primeiro; setas navegam; Enter dispara', () => {
      const { cbs } = setup();
      const t = trigger();
      t?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      return Promise.resolve().then(() => {
        const sh = shadowOf(ACTION_HOST_ATTR) as ShadowRoot;
        expect(sh.activeElement?.textContent).toBe('Preencher: A');
        const menu = sh.querySelector('[role="menu"]') as HTMLElement;
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(sh.activeElement?.textContent).toBe('Preencher: B');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(sh.activeElement?.textContent).toBe('Preencher: C');
        click(sh.activeElement);
        expect(cbs[2]).toHaveBeenCalledTimes(1);
      });
    });

    it('esconder uma regra com o menu aberto atualiza a lista; com 2 volta a empilhar', () => {
      const { ui } = setup();
      click(trigger());
      ui.hideActionButton('b');
      // Ainda 2 regras: o menu deixa de existir e os botões empilham.
      expect(items()).toHaveLength(0);
      const texts = [...(shadowOf(ACTION_HOST_ATTR)?.querySelectorAll('button') ?? [])].map(
        (b) => b.textContent,
      );
      expect(texts).toEqual(['Preencher: A', 'Preencher: C']);
      ui.showActionButton('d', 'Preencher: D', vi.fn());
      ui.showActionButton('e', 'Preencher: E', vi.fn());
      click(trigger());
      expect(items()).toHaveLength(4);
      ui.hideActionButton('a');
      expect(items().map((i) => i.textContent)).toEqual([
        'Preencher: C',
        'Preencher: D',
        'Preencher: E',
      ]);
    });

    it('esconder todas remove o host', () => {
      const { ui } = setup();
      click(trigger());
      for (const id of ['a', 'b', 'c']) ui.hideActionButton(id);
      expect(document.querySelector(`[${ACTION_HOST_ATTR}]`)).toBeNull();
    });
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
