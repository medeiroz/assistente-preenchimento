import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createContextWatcher,
  createUrlWatcher,
  type ContextWatcher,
} from '../../../src/core/engine';

const SETTLE = 300;

function modalHtml(title: string, cls = 'modal is-active'): string {
  return `<div class="${cls}"><h1>${title}</h1><div class="body"></div></div>`;
}

function add(html: string, parent: Element = document.body): Element {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const el = tpl.content.firstElementChild;
  if (!el) throw new Error('html vazio');
  parent.appendChild(el);
  return el;
}

async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('createContextWatcher', () => {
  let watcher: ContextWatcher | undefined;
  const onAppear = vi.fn<(el: Element) => void>();
  const onGone = vi.fn<(el: Element) => void>();
  const onChange = vi.fn<(el: Element) => void>();

  function make(textContains?: string): ContextWatcher {
    const container =
      textContains === undefined
        ? { selector: '.modal.is-active' }
        : { selector: '.modal.is-active', textContains };
    watcher = createContextWatcher({
      document,
      container,
      settleMs: SETTLE,
      onAppear,
      onGone,
      onChange,
    });
    return watcher;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    onAppear.mockReset();
    onGone.mockReset();
    onChange.mockReset();
  });

  afterEach(() => {
    watcher?.stop();
    watcher = undefined;
    vi.useRealTimers();
  });

  it('contexto existente no start aparece após settleMs', async () => {
    const el = add(modalHtml('A'));
    const w = make();
    w.start();
    await tick(SETTLE - 1);
    expect(onAppear).not.toHaveBeenCalled();
    await tick(1);
    expect(onAppear).toHaveBeenCalledTimes(1);
    expect(onAppear).toHaveBeenCalledWith(el);
    expect(w.active()).toEqual([el]);
  });

  it('contexto que aparece depois', async () => {
    const w = make();
    w.start();
    await tick(1000);
    expect(onAppear).not.toHaveBeenCalled();
    const el = add(modalHtml('A'));
    await tick(SETTLE + 10);
    expect(onAppear).toHaveBeenCalledExactlyOnceWith(el);
  });

  it('mutações dentro do contexto reiniciam o settle', async () => {
    const w = make();
    w.start();
    const el = add(modalHtml('A'));
    await tick(200);
    add('<input>', el.querySelector('.body') as Element);
    await tick(200);
    expect(onAppear).not.toHaveBeenCalled();
    add('<input>', el.querySelector('.body') as Element);
    await tick(200);
    expect(onAppear).not.toHaveBeenCalled();
    await tick(150);
    expect(onAppear).toHaveBeenCalledTimes(1);
  });

  it('some por remoção do DOM', async () => {
    const el = add(modalHtml('A'));
    make().start();
    await tick(SETTLE);
    el.remove();
    await tick(10);
    expect(onGone).toHaveBeenCalledExactlyOnceWith(el);
    expect(watcher?.active()).toEqual([]);
  });

  it('some por perda de classe e reaparece = nova aparição', async () => {
    const el = add(modalHtml('A'));
    make().start();
    await tick(SETTLE);
    expect(onAppear).toHaveBeenCalledTimes(1);

    el.classList.remove('is-active');
    await tick(10);
    expect(onGone).toHaveBeenCalledTimes(1);

    el.classList.add('is-active');
    await tick(SETTLE + 10);
    expect(onAppear).toHaveBeenCalledTimes(2);
    expect(onAppear).toHaveBeenLastCalledWith(el);
  });

  it('novo elemento após remoção também é nova aparição', async () => {
    const first = add(modalHtml('A'));
    make().start();
    await tick(SETTLE);
    first.remove();
    await tick(10);
    const second = add(modalHtml('A'));
    await tick(SETTLE + 10);
    expect(onAppear).toHaveBeenCalledTimes(2);
    expect(onAppear).toHaveBeenLastCalledWith(second);
  });

  it('desaparecer durante o settle cancela sem onGone', async () => {
    const el = add(modalHtml('A'));
    make().start();
    await tick(100);
    el.classList.remove('is-active');
    await tick(1000);
    expect(onAppear).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
  });

  it('onChange para campo adicionado depois, com debounce', async () => {
    const el = add(modalHtml('A'));
    make().start();
    await tick(SETTLE);
    expect(onChange).not.toHaveBeenCalled();

    const body = el.querySelector('.body') as Element;
    add('<input>', body);
    await tick(100);
    add('<input>', body);
    await tick(SETTLE - 1);
    expect(onChange).not.toHaveBeenCalled();
    await tick(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(el);
  });

  it('dois contextos simultâneos são independentes', async () => {
    const a = add(modalHtml('A'));
    const w = make();
    w.start();
    await tick(SETTLE);
    const b = add(modalHtml('B'));
    await tick(SETTLE + 10);
    expect(onAppear).toHaveBeenCalledTimes(2);
    expect(w.active()).toEqual([a, b]);

    a.remove();
    await tick(10);
    expect(onGone).toHaveBeenCalledExactlyOnceWith(a);
    expect(w.active()).toEqual([b]);

    onChange.mockClear();
    add('<input>', b.querySelector('.body') as Element);
    await tick(SETTLE + 10);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(b);
  });

  it('stop desconecta e cancela timers', async () => {
    const w = make();
    w.start();
    add(modalHtml('A'));
    await tick(100);
    w.stop();
    await tick(2000);
    expect(onAppear).not.toHaveBeenCalled();
    add(modalHtml('B'));
    await tick(2000);
    expect(onAppear).not.toHaveBeenCalled();
    expect(w.active()).toEqual([]);
  });

  it('stop após aparecer não dispara onGone nem onChange', async () => {
    const el = add(modalHtml('A'));
    const w = make();
    w.start();
    await tick(SETTLE);
    add('<input>', el.querySelector('.body') as Element);
    w.stop();
    el.remove();
    await tick(2000);
    expect(onGone).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('textContains filtra modal com outro título', async () => {
    add(modalHtml('Outro modal'));
    const nfse = add(modalHtml('Emitir Nota Fiscal de Serviços Eletrônica'));
    make('Emitir Nota Fiscal').start();
    await tick(SETTLE + 10);
    expect(onAppear).toHaveBeenCalledExactlyOnceWith(nfse);
  });
});

describe('createUrlWatcher', () => {
  const urls: string[] = [];
  const onChange = (u: string): void => {
    urls.push(u);
  };

  beforeEach(() => {
    urls.length = 0;
    window.history.replaceState(null, '', '/inicio');
  });

  it('pushState e replaceState disparam uma vez por mudança', () => {
    const w = createUrlWatcher(window, onChange);
    w.start();
    window.history.pushState(null, '', '/a');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/a');
    window.history.pushState(null, '', '/a');
    expect(urls).toHaveLength(1);
    window.history.replaceState(null, '', '/b');
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('/b');
    w.stop();
  });

  it('popstate dispara quando o href mudou, e só uma vez', () => {
    const origPush = window.history.pushState;
    const w = createUrlWatcher(window, onChange);
    w.start();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(urls).toHaveLength(0);
    // muda a URL por fora do patch (como o back do navegador faria)
    origPush.call(window.history, null, '', '/c');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/c');
    w.stop();
  });

  it('hashchange dispara', () => {
    const w = createUrlWatcher(window, onChange);
    w.start();
    window.location.hash = '#x';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(urls.length).toBeGreaterThanOrEqual(1);
    expect(urls.at(-1)).toContain('#x');
    w.stop();
  });

  it('stop restaura pushState/replaceState originais e remove listeners', () => {
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    const w = createUrlWatcher(window, onChange);
    w.start();
    expect(window.history.pushState).not.toBe(origPush);
    w.stop();
    expect(window.history.pushState).toBe(origPush);
    expect(window.history.replaceState).toBe(origReplace);
    window.history.pushState(null, '', '/zzz');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(urls).toHaveLength(0);
  });
});
