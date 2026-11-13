import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRule, type Rule, type RunReport } from '../../../src/core/model';
import { createController, type Controller } from '../../../src/core/engine';

const SETTLE = 300;
const BASE = 'https://exemplo.com/nfse/1';

function makeRule(o: { mode?: 'auto' | 'button' | 'off'; id?: string } = {}): Rule {
  const r = parseRule({
    id: o.id ?? 'r1',
    name: 'Regra de teste',
    trigger: {
      urlPatterns: ['https://exemplo.com/nfse/*'],
      container: { selector: '.modal.is-active', textContains: 'Emitir' },
      settleMs: SETTLE,
    },
    behavior: { mode: o.mode ?? 'auto', overwrite: 'onlyIfDefault' },
    fields: [
      { id: 'a', locator: { by: 'label', text: 'Campo A' }, value: 'valor-a' },
      { id: 'b', locator: { by: 'label', text: 'Campo B' }, value: 'valor-b' },
    ],
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

function modalHtml(a = '', b = ''): string {
  return `<div class="modal is-active"><h1>Emitir nota</h1>
    <div class="f"><label>Campo A</label><input id="a" type="text" value="${a}"></div>
    <div class="f"><label>Campo B</label><input id="b" type="text" value="${b}"></div>
  </div>`;
}

function addModal(html = modalHtml()): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const el = tpl.content.firstElementChild as HTMLElement;
  document.body.appendChild(el);
  return el;
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('createController', () => {
  let controller: Controller | undefined;
  const showReport = vi.fn<(r: RunReport, actions?: { undo?: () => void }) => void>();
  const showActionButton = vi.fn<(id: string, label: string, onClick: () => void) => void>();
  const hideActionButton = vi.fn<(id: string) => void>();
  const highlight = vi.fn<(roots: Element[]) => void>();

  function make(rules: Rule[]): Controller {
    controller = createController({
      window,
      rules,
      ui: { showReport, highlight, showActionButton, hideActionButton },
    });
    controller.start();
    return controller;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(BASE);
    showReport.mockReset();
    showActionButton.mockReset();
    hideActionButton.mockReset();
    highlight.mockReset();
  });

  afterEach(() => {
    controller?.stop();
    controller = undefined;
    vi.useRealTimers();
  });

  it('preenche ao aparecer e chama ui.showReport/highlight', async () => {
    const c = make([makeRule()]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('a').value).toBe('valor-a');
    expect(input('b').value).toBe('valor-b');
    expect(showReport).toHaveBeenCalledTimes(1);
    expect(showReport.mock.calls[0]?.[0].fields.map((f) => f.outcome)).toEqual([
      'filled',
      'filled',
    ]);
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(highlight.mock.calls[0]?.[0]).toHaveLength(2);
    expect(c.lastReport()?.ruleId).toBe('r1');
  });

  it('não toca em campo já preenchido', async () => {
    make([makeRule()]);
    addModal(modalHtml('meu-valor', ''));
    await tick(SETTLE + 50);
    expect(input('a').value).toBe('meu-valor');
    expect(input('b').value).toBe('valor-b');
  });

  it('não re-preenche na mesma aparição após o usuário apagar e o DOM mudar', async () => {
    make([makeRule()]);
    const modal = addModal();
    await tick(SETTLE + 50);
    input('a').value = '';
    modal.appendChild(document.createElement('p'));
    await tick(2000);
    expect(input('a').value).toBe('');
    expect(showReport).toHaveBeenCalledTimes(1);
  });

  it('remover e reinserir o modal preenche de novo', async () => {
    make([makeRule()]);
    const modal = addModal();
    await tick(SETTLE + 50);
    input('a').value = '';
    modal.remove();
    await tick(50);
    addModal();
    await tick(SETTLE + 50);
    expect(input('a').value).toBe('valor-a');
    expect(showReport).toHaveBeenCalledTimes(2);
  });

  it("mode 'off' não preenche", async () => {
    make([makeRule({ mode: 'off' })]);
    addModal();
    await tick(2000);
    expect(input('a').value).toBe('');
    expect(showReport).not.toHaveBeenCalled();
  });

  it('URL fora do padrão para os watchers', async () => {
    make([makeRule()]);
    window.history.pushState({}, '', '/fora/1');
    await tick(50);
    addModal();
    await tick(2000);
    expect(input('a').value).toBe('');
  });

  it('volta ao padrão: watchers reiniciam', async () => {
    make([makeRule()]);
    window.history.pushState({}, '', '/fora/1');
    window.history.pushState({}, '', '/nfse/2');
    addModal();
    await tick(SETTLE + 50);
    expect(input('a').value).toBe('valor-a');
  });

  it('runNow preenche campo que o usuário esvaziou', async () => {
    const c = make([makeRule()]);
    addModal(modalHtml('x', ''));
    await tick(SETTLE + 50);
    expect(input('a').value).toBe('x');
    input('a').value = '';
    const reports = await c.runNow('r1');
    expect(reports).toHaveLength(1);
    expect(reports[0]?.origin).toBe('manual');
    expect(input('a').value).toBe('valor-a');
  });

  it('runNow com ruleId desconhecido não faz nada', async () => {
    const c = make([makeRule()]);
    addModal();
    await tick(SETTLE + 50);
    expect(await c.runNow('outra')).toEqual([]);
  });

  it('nada a fazer: showReport não é chamado', async () => {
    make([makeRule()]);
    addModal(modalHtml('1', '2'));
    await tick(SETTLE + 50);
    expect(input('a').value).toBe('1');
    expect(showReport).not.toHaveBeenCalled();
    expect(highlight).not.toHaveBeenCalled();
  });

  describe('modo botão e desfazer', () => {
    it('mode button não preenche ao aparecer e mostra o botão; clique preenche e esconde', async () => {
      make([makeRule({ mode: 'button' })]);
      addModal();
      await tick(SETTLE + 50);
      expect(input('a').value).toBe('');
      expect(showReport).not.toHaveBeenCalled();
      expect(showActionButton).toHaveBeenCalledTimes(1);
      expect(showActionButton.mock.calls[0]?.[0]).toBe('r1');
      expect(showActionButton.mock.calls[0]?.[1]).toBe('Preencher: Regra de teste');
      showActionButton.mock.calls[0]?.[2]();
      await tick(50);
      expect(input('a').value).toBe('valor-a');
      expect(input('b').value).toBe('valor-b');
      expect(hideActionButton).toHaveBeenCalledWith('r1');
      expect(showReport).toHaveBeenCalledTimes(1);
    });

    it('respeita "só se padrão" com o snapshot da aparição', async () => {
      make([makeRule({ mode: 'button' })]);
      addModal(modalHtml('existente', ''));
      await tick(SETTLE + 50);
      showActionButton.mock.calls[0]?.[2]();
      await tick(50);
      expect(input('a').value).toBe('existente');
      expect(input('b').value).toBe('valor-b');
    });

    it('onGone esconde o botão', async () => {
      make([makeRule({ mode: 'button' })]);
      const el = addModal();
      await tick(SETTLE + 50);
      hideActionButton.mockReset();
      el.remove();
      await tick(SETTLE + 50);
      expect(hideActionButton).toHaveBeenCalledWith('r1');
    });

    it('um botão por regra', async () => {
      make([makeRule({ mode: 'button', id: 'r1' }), makeRule({ mode: 'button', id: 'r2' })]);
      addModal();
      await tick(SETTLE + 50);
      expect(showActionButton.mock.calls.map((c) => c[0]).sort()).toEqual(['r1', 'r2']);
    });

    it('toast recebe actions.undo quando há filled; undo restaura e reporta', async () => {
      make([makeRule()]);
      addModal();
      await tick(SETTLE + 50);
      const actions = showReport.mock.calls[0]?.[1];
      expect(actions?.undo).toBeTypeOf('function');
      actions?.undo?.();
      await tick(50);
      expect(input('a').value).toBe('');
      expect(showReport).toHaveBeenCalledTimes(2);
      expect(showReport.mock.calls[1]?.[1]).toBeUndefined();
      expect(showReport.mock.calls[1]?.[0].fields.map((f) => f.outcome)).toEqual([
        'undone',
        'undone',
      ]);
    });

    it('sem campos filled o toast não recebe actions', async () => {
      make([makeRule()]);
      addModal('<div class="modal is-active"><h1>Emitir nota</h1></div>');
      await tick(SETTLE + 50);
      expect(showReport).toHaveBeenCalled();
      expect(showReport.mock.calls[0]?.[1]).toBeUndefined();
    });
  });
});
