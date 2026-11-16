import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackContextTarget } from '../../../src/entrypoints/content/context-target';
import { buildCapture } from '../../../src/core/locator';
import { deliverCapture } from '../../../src/entrypoints/content/picker';

afterEach(() => {
  document.body.innerHTML = '';
});

function contextmenu(target: Element): void {
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true }));
}

describe('alvo do contextmenu', () => {
  it('guarda o elemento do último contextmenu e gera a captura dele', async () => {
    document.body.innerHTML = `<div role="dialog"><h2>Título</h2>
      <div><label for="i1">Cidade</label><input id="i1" type="text"></div>
      <div><label for="i2">Bairro</label><input id="i2" type="text"></div></div>`;
    const t = trackContextTarget(window);
    expect(t.take()).toBeNull();
    contextmenu(document.getElementById('i1') as Element);
    contextmenu(document.getElementById('i2') as Element);
    const target = t.take();
    expect(target?.id).toBe('i2');
    const capture = buildCapture(target as Element, document, 'http://x/');
    expect(capture).not.toBeNull();

    const set = vi.fn(() => Promise.resolve());
    const sendMessage = vi.fn(() => Promise.resolve());
    await deliverCapture(capture!, { storage: { set }, sendMessage, now: () => 1 });
    expect(set).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'options/open-draft' });
    t.dispose();
  });

  it('atravessa shadow root aberto (composedPath) e ignora elemento removido', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<input id="dentro">';
    const t = trackContextTarget(window);
    contextmenu(root.getElementById('dentro') as Element);
    expect(t.take()?.id).toBe('dentro');
    host.remove();
    expect(t.take()).toBeNull();
    t.dispose();
  });

  it('dispose para de ouvir', () => {
    document.body.innerHTML = '<input id="a">';
    const t = trackContextTarget(window);
    t.dispose();
    contextmenu(document.getElementById('a') as Element);
    expect(t.take()).toBeNull();
  });
});
