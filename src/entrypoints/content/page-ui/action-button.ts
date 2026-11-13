import { isolateEvents } from './shared';

export const ACTION_HOST_ATTR = 'data-assistente-acao';

const STYLE = `
:host { all: initial; }
.stack {
  position: fixed; right: 16px; bottom: 96px; z-index: 2147483647;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  max-width: calc(100vw - 32px);
}
.act {
  all: unset; box-sizing: border-box; cursor: pointer;
  max-width: 100%; padding: 8px 14px; border-radius: 999px;
  background: #2563eb; color: #fff;
  font: 600 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.act:hover { background: #1d4ed8; }
.act:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
`;

export interface ActionButtons {
  show(id: string, label: string, onClick: () => void): void;
  hide(id: string): void;
}

/** Botões flutuantes (um por regra) em um único host com Shadow DOM. */
export function createActionButtons(): ActionButtons {
  let host: HTMLElement | null = null;
  let stack: HTMLElement | null = null;
  const buttons = new Map<string, HTMLButtonElement>();

  function ensure(): HTMLElement {
    if (host && stack) return stack;
    const el = document.createElement('div');
    el.setAttribute(ACTION_HOST_ATTR, '');
    isolateEvents(el);
    const shadow = el.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const st = document.createElement('div');
    st.className = 'stack';
    shadow.append(style, st);
    (document.body ?? document.documentElement).append(el);
    host = el;
    stack = st;
    return st;
  }

  function hide(id: string): void {
    buttons.get(id)?.remove();
    buttons.delete(id);
    if (buttons.size === 0 && host) {
      host.remove();
      host = null;
      stack = null;
    }
  }

  return {
    show(id, label, onClick) {
      const parent = ensure();
      let b = buttons.get(id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'act';
        buttons.set(id, b);
        parent.append(b);
      }
      b.textContent = label;
      b.setAttribute('aria-label', label);
      b.onclick = () => onClick();
    },
    hide,
  };
}
