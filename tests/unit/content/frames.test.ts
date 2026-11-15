import { afterEach, describe, expect, it, vi } from 'vitest';
import { createController } from '../../../src/core/engine';
import { parseRule, type Rule, type RunReport } from '../../../src/core/model';
import {
  createFrameReporter,
  createRelayedUi,
  createTopRelay,
  type PageUi,
} from '../../../src/entrypoints/content/frames';
import type { Message } from '../../../src/shared/messages';

const report: RunReport = {
  ruleId: 'r1',
  ruleName: 'Regra',
  startedAt: '2026-01-01T00:00:00.000Z',
  url: 'http://x/',
  origin: 'auto',
  fields: [],
};

function fakeUi(): PageUi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    showReport: (r, a) => calls.push(`report:${r.ruleName}:${a?.undo ? 'undo' : 'plain'}`),
    highlight: () => calls.push('highlight'),
    showActionButton: (id, label) => calls.push(`show:${id}:${label}`),
    hideActionButton: (id) => calls.push(`hide:${id}`),
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('UI de um frame filho (relay para o topo)', () => {
  it('toast: se o topo aceita (true), não mostra localmente', async () => {
    const local = fakeUi();
    const send = vi.fn<(m: Message) => Promise<unknown>>(() => Promise.resolve(true));
    const { ui } = createRelayedUi(local, send);
    ui.showReport(report, { undo: () => undefined });
    await flush();
    expect(send).toHaveBeenCalledWith({ type: 'ui/toast', payload: { report, canUndo: true } });
    expect(local.calls).toEqual([]);
  });

  it('toast: sem motor no topo (false) ou erro, mostra no próprio frame', async () => {
    const local = fakeUi();
    const { ui } = createRelayedUi(local, () => Promise.resolve(false));
    ui.showReport(report);
    await flush();
    const failing = fakeUi();
    createRelayedUi(failing, () => Promise.reject(new Error('x'))).ui.showReport(report);
    await flush();
    expect(local.calls).toEqual(['report:Regra:plain']);
    expect(failing.calls).toEqual(['report:Regra:plain']);
  });

  it('destaque fica sempre no próprio frame', () => {
    const local = fakeUi();
    createRelayedUi(local, () => Promise.resolve(true)).ui.highlight([]);
    expect(local.calls).toEqual(['highlight']);
  });

  it('botão: relay quando o topo aceita; senão aparece local; esconder cancela o fallback', async () => {
    const local = fakeUi();
    const accepted = createRelayedUi(local, () => Promise.resolve(true));
    accepted.ui.showActionButton('r1', 'Preencher', () => undefined);
    await flush();
    expect(local.calls).toEqual([]);

    const l2 = fakeUi();
    createRelayedUi(l2, () => Promise.resolve(false)).ui.showActionButton(
      'r1',
      'P',
      () => undefined,
    );
    await flush();
    expect(l2.calls).toEqual(['show:r1:P']);

    const l3 = fakeUi();
    const late = createRelayedUi(l3, () => Promise.resolve(false));
    late.ui.showActionButton('r1', 'P', () => undefined);
    late.ui.hideActionButton('r1'); // antes da resposta chegar
    await flush();
    expect(l3.calls).toEqual(['hide:r1']);
  });

  it('cliques vindos do topo chamam o botão e o desfazer deste frame', async () => {
    const local = fakeUi();
    const send = vi.fn<(m: Message) => Promise<unknown>>(() => Promise.resolve(true));
    const relayed = createRelayedUi(local, send);
    const onClick = vi.fn();
    const undo = vi.fn();
    relayed.ui.showActionButton('r1', 'P', onClick);
    relayed.ui.showReport(report, { undo });
    relayed.handleAction({ frameId: 3, kind: 'button', id: 'r1' });
    relayed.handleAction({ frameId: 3, kind: 'undo' });
    expect(onClick).toHaveBeenCalledOnce();
    expect(undo).toHaveBeenCalledOnce();
    relayed.ui.hideActionButton('r1');
    relayed.handleAction({ frameId: 3, kind: 'button', id: 'r1' });
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('frame de topo recebendo a UI dos filhos', () => {
  it('mostra o toast com Desfazer que devolve o clique ao frame de origem', () => {
    const ui = fakeUi();
    const actions: unknown[] = [];
    let undo: (() => void) | undefined;
    ui.showReport = (_r, a) => {
      undo = a?.undo;
    };
    const top = createTopRelay(ui, (a) => actions.push(a));
    expect(top.handle({ type: 'ui/toast', payload: { report, canUndo: true, frameId: 4 } })).toBe(
      true,
    );
    undo?.();
    expect(actions).toEqual([{ frameId: 4, kind: 'undo' }]);
  });

  it('botões são chaveados por frame; frame que sai remove os seus', () => {
    const ui = fakeUi();
    const top = createTopRelay(ui, () => undefined);
    const show = (frameId: number, id: string, shown: boolean) =>
      top.handle({ type: 'ui/button', payload: { frameId, id, label: 'L', shown } });
    show(4, 'r1', true);
    show(5, 'r1', true);
    show(4, 'r2', true);
    show(4, 'r2', false);
    top.handle({ type: 'ui/frame-gone', payload: { frameId: 4 } });
    expect(ui.calls).toEqual([
      'show:frame4:r1:L',
      'show:frame5:r1:L',
      'show:frame4:r2:L',
      'hide:frame4:r2',
      'hide:frame4:r1',
    ]);
  });

  it('o clique no botão vira ui/action para o frame dono', () => {
    const ui = fakeUi();
    const actions: unknown[] = [];
    let click: (() => void) | undefined;
    ui.showActionButton = (_id, _l, onClick) => {
      click = onClick;
    };
    createTopRelay(ui, (a) => actions.push(a)).handle({
      type: 'ui/button',
      payload: { frameId: 4, id: 'r1', label: 'L', shown: true },
    });
    click?.();
    expect(actions).toEqual([{ frameId: 4, kind: 'button', id: 'r1' }]);
  });

  it('não consome mensagens que não são do relay', () => {
    expect(createTopRelay(fakeUi(), () => undefined).handle({ type: 'config/get' })).toBe(false);
  });
});

describe('registro do frame (frame/hello e frame/bye)', () => {
  afterEach(() => vi.useRealTimers());

  const snap = (name: string) => ({
    url: 'http://x/',
    activeRules: [{ id: 'r', name, mode: 'auto' as const }],
    lastReport: null,
  });

  it('só reenvia quando o estado muda', async () => {
    vi.useFakeTimers();
    let name = 'A';
    const send = vi.fn<(m: Message) => Promise<unknown>>(() => Promise.resolve(undefined));
    const rep = createFrameReporter({ send, snapshot: () => snap(name) });
    rep.notify();
    await vi.advanceTimersByTimeAsync(5);
    rep.notify();
    await vi.advanceTimersByTimeAsync(5);
    expect(send).toHaveBeenCalledTimes(1);
    name = 'B';
    rep.notify();
    rep.notify(); // agrupado
    await vi.advanceTimersByTimeAsync(5);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual({ type: 'frame/hello', payload: snap('B') });
  });

  it('hello devolve a resposta do background; bye envia frame/bye', async () => {
    const send = vi.fn((m: Message) =>
      Promise.resolve(m.type === 'frame/hello' ? { topUrl: 'https://topo.com/' } : undefined),
    );
    const rep = createFrameReporter({ send, snapshot: () => snap('A') });
    expect(await rep.hello()).toEqual({ topUrl: 'https://topo.com/' });
    rep.bye();
    expect(send).toHaveBeenLastCalledWith({ type: 'frame/bye', payload: {} });
  });

  it('erro do background no hello não quebra o frame', async () => {
    const rep = createFrameReporter({
      send: () => Promise.reject(new Error('sw dormindo')),
      snapshot: () => snap('A'),
    });
    expect(await rep.hello()).toBeUndefined();
  });
});

describe('controller em frame filho', () => {
  function rule(id: string, frames?: 'all'): Rule {
    const r = parseRule({
      id,
      name: id,
      trigger: { urlPatterns: ['*://*/*'], settleMs: 50, ...(frames ? { frames } : {}) },
      fields: [{ id: 'f', locator: { by: 'selector', css: '#a' }, value: 'x' }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    if (!r.ok) throw new Error(r.errors.join(';'));
    return r.rule;
  }
  const make = (isTopFrame: boolean, onStateChange = vi.fn()) =>
    createController({
      window,
      rules: [rule('topo'), rule('todos', 'all')],
      ui: fakeUi(),
      isTopFrame,
      onStateChange,
    });

  it('filtra por frame e avisa quando o estado muda', () => {
    const child = make(false);
    child.start();
    expect(child.activeRules().map((r) => r.id)).toEqual(['todos']);
    child.stop();

    const onState = vi.fn();
    const top = make(true, onState);
    top.start();
    expect(top.activeRules().map((r) => r.id)).toEqual(['topo', 'todos']);
    expect(onState).toHaveBeenCalled();
    top.stop();
  });
});
