import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PICKER_DRAFT_KEY, type Capture } from '../../../src/core/locator';
import {
  PICKER_HOST_ATTR,
  createPicker,
  deliverCapture,
} from '../../../src/entrypoints/content/picker';

const FORM = `
  <div role="dialog"><h2>Título</h2>
    <div class="f" id="f1"><label for="i1">Cidade</label><input id="i1" type="text"></div>
    <p id="fora">texto solto</p>
  </div>`;

function shadow(): ShadowRoot | undefined {
  return document.querySelector(`[${PICKER_HOST_ATTR}]`)?.shadowRoot ?? undefined;
}

function mouse(type: string, target: Element): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(ev);
  return ev;
}

function key(type: string, k: string): KeyboardEvent {
  const ev = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
  document.body.dispatchEvent(ev);
  return ev;
}

describe('createPicker', () => {
  let onCapture: ReturnType<typeof vi.fn<(c: Capture) => void>>;
  let onCancel: ReturnType<typeof vi.fn<() => void>>;
  const siteSeen: string[] = [];
  const siteListener = (e: Event) => siteSeen.push(e.type);
  const SITE_EVENTS = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'keydown'];

  beforeEach(() => {
    document.body.innerHTML = FORM;
    siteSeen.length = 0;
    for (const t of SITE_EVENTS) document.addEventListener(t, siteListener);
    onCapture = vi.fn<(c: Capture) => void>();
    onCancel = vi.fn<() => void>();
  });
  afterEach(() => {
    for (const t of SITE_EVENTS) document.removeEventListener(t, siteListener);
    document.body.innerHTML = '';
  });

  it('mostra a faixa em Shadow DOM e remove tudo ao cancelar pelo botão', () => {
    const picker = createPicker({ onCapture, onCancel });
    picker.start();
    expect(picker.active).toBe(true);
    const root = shadow();
    expect(root?.querySelector('.bar')?.textContent).toContain(
      'Clique no campo que deseja preencher automaticamente',
    );
    (root?.querySelector('.cancel') as HTMLElement).click();
    expect(picker.active).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCapture).not.toHaveBeenCalled();
    expect(document.querySelector(`[${PICKER_HOST_ATTR}]`)).toBeNull();
  });

  it('clique no campo: site não vê os eventos; captura e encerra', () => {
    const picker = createPicker({ onCapture, onCancel });
    picker.start();
    const input = document.getElementById('i1') as Element;
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      expect(mouse(t, input).defaultPrevented).toBe(true);
    }
    expect(picker.active).toBe(true);
    const click = mouse('click', input);
    expect(click.defaultPrevented).toBe(true);
    expect(siteSeen).toEqual([]);
    expect(picker.active).toBe(false);
    expect(onCapture).toHaveBeenCalledOnce();
    const c = onCapture.mock.calls[0]?.[0];
    expect(c?.locator).toEqual({ by: 'label', text: 'Cidade' });
    expect(c?.container).toEqual({ selector: '[role="dialog"]', textContains: 'Título' });
    expect(document.querySelector(`[${PICKER_HOST_ATTR}]`)).toBeNull();
    // listeners removidos: o site volta a ver os cliques
    mouse('click', input);
    expect(siteSeen).toEqual(['click']);
  });

  it('clique fora de campo: avisa e continua no modo captura', () => {
    const picker = createPicker({ onCapture, onCancel });
    picker.start();
    mouse('click', document.getElementById('fora') as Element);
    expect(picker.active).toBe(true);
    expect(onCapture).not.toHaveBeenCalled();
    expect(shadow()?.querySelector('.note')?.textContent).toContain('não parece ser um campo');
    picker.stop();
  });

  it('Escape do usuário: o site não vê o keydown e o modo cancela', () => {
    const picker = createPicker({ onCapture, onCancel });
    picker.start();
    const down = key('keydown', 'Escape');
    expect(down.defaultPrevented).toBe(true);
    expect(siteSeen).toEqual([]);
    expect(picker.active).toBe(false);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.querySelector(`[${PICKER_HOST_ATTR}]`)).toBeNull();
    key('keyup', 'Escape'); // solta a tecla: encerra a guarda do keyup
    // outras teclas passam normalmente depois
    key('keydown', 'a');
    expect(siteSeen).toEqual(['keydown']);
  });

  it('o keyup do Escape que cancelou também é engolido (uma vez)', () => {
    const seen: string[] = [];
    const onUp = (e: Event) => seen.push(e.type);
    document.addEventListener('keyup', onUp);
    const picker = createPicker({ onCapture, onCancel });
    picker.start();
    key('keydown', 'Escape');
    key('keyup', 'Escape');
    expect(seen).toEqual([]);
    key('keyup', 'Escape'); // guarda já se desfez
    expect(seen).toEqual(['keyup']);
    document.removeEventListener('keyup', onUp);
  });

  it('hover destaca a raiz do campo com rótulo e tipo', async () => {
    const picker = createPicker({ onCapture, onCancel });
    picker.start();
    document.getElementById('i1')?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const box = shadow()?.querySelector('.box') as HTMLElement;
    const tag = shadow()?.querySelector('.tag') as HTMLElement;
    expect(box.style.display).toBe('block');
    expect(tag.textContent).toBe('Cidade · Texto');
    // o site não foi alterado (nenhum estilo inline na raiz)
    expect((document.getElementById('f1') as HTMLElement).getAttribute('style')).toBeNull();
    picker.stop();
  });

  it('start duplo não duplica o overlay; stop sem start não falha', () => {
    const picker = createPicker({ onCapture, onCancel });
    picker.stop();
    picker.start();
    picker.start();
    expect(document.querySelectorAll(`[${PICKER_HOST_ATTR}]`)).toHaveLength(1);
    picker.stop();
    expect(document.querySelectorAll(`[${PICKER_HOST_ATTR}]`)).toHaveLength(0);
  });
});

describe('deliverCapture', () => {
  const cap: Capture = {
    locator: { by: 'label', text: 'A' },
    adapter: 'auto',
    currentValue: null,
    label: 'A',
    urlPattern: 'https://x.com/*',
  };

  it('grava o rascunho e só depois avisa o background', async () => {
    const order: string[] = [];
    const set = vi.fn(async (items: Record<string, unknown>) => {
      order.push('set');
      expect(items).toEqual({ [PICKER_DRAFT_KEY]: { capture: cap, createdAt: 42 } });
    });
    const sendMessage = vi.fn(async () => {
      order.push('send');
    });
    await deliverCapture(cap, { storage: { set }, sendMessage, now: () => 42 });
    expect(order).toEqual(['set', 'send']);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'options/open-draft' });
  });
});
