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
.menu-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; max-width: 100%; }
.menu {
  display: flex; flex-direction: column; min-width: 200px; max-width: 100%; padding: 4px;
  border-radius: 10px; background: #fff; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
}
.item {
  all: unset; box-sizing: border-box; cursor: pointer; padding: 8px 12px; border-radius: 6px;
  color: #111827; font: 500 13px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif;
  overflow-wrap: anywhere;
}
.item:hover, .item:focus-visible { background: #dbeafe; }
.item:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
`;

/** A partir deste número de regras com botão, os botões viram um único menu "Preencher…". */
export const MENU_THRESHOLD = 3;
export const MENU_LABEL = 'Preencher…';

export interface ActionButtons {
  show(id: string, label: string, onClick: () => void): void;
  hide(id: string): void;
}

interface Entry {
  label: string;
  onClick: () => void;
}

/**
 * Botões flutuantes em um único host com Shadow DOM. Até 2 regras: um botão por regra,
 * empilhados. Com 3 ou mais: um botão "Preencher…" que abre um menu (role="menu").
 */
export function createActionButtons(): ActionButtons {
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let stack: HTMLElement | null = null;
  const entries = new Map<string, Entry>();
  let menuOpen = false;
  let focusId: string | null = null;
  let trigger: HTMLButtonElement | null = null;

  function ensure(): HTMLElement {
    if (host && stack) return stack;
    const el = document.createElement('div');
    el.setAttribute(ACTION_HOST_ATTR, '');
    isolateEvents(el);
    const sh = el.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const st = document.createElement('div');
    st.className = 'stack';
    sh.append(style, st);
    (document.body ?? document.documentElement).append(el);
    host = el;
    shadow = sh;
    stack = st;
    return st;
  }

  function onOutside(e: Event): void {
    if (host && (e.target === host || e.composedPath().includes(host))) return;
    closeMenu(false);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && menuOpen) {
      e.stopPropagation();
      closeMenu(true);
    }
  }

  function listen(on: boolean): void {
    if (on) {
      window.addEventListener('pointerdown', onOutside, true);
      window.addEventListener('click', onOutside, true);
      window.addEventListener('keydown', onKey, true);
    } else {
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('click', onOutside, true);
      window.removeEventListener('keydown', onKey, true);
    }
  }

  function closeMenu(restoreFocus: boolean): void {
    if (!menuOpen) return;
    menuOpen = false;
    focusId = null;
    listen(false);
    render();
    if (restoreFocus) trigger?.focus();
  }

  function openMenu(focusFirst: boolean): void {
    if (menuOpen) return;
    menuOpen = true;
    listen(true);
    focusId = focusFirst ? ([...entries.keys()][0] ?? null) : null;
    render();
  }

  function makeButton(id: string, e: Entry): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'act';
    b.textContent = e.label;
    b.setAttribute('aria-label', e.label);
    b.onclick = () => entries.get(id)?.onClick();
    return b;
  }

  function moveFocus(items: HTMLElement[], from: number, delta: number | 'first' | 'last'): void {
    const n = items.length;
    const next = delta === 'first' ? 0 : delta === 'last' ? n - 1 : (from + delta + n) % n;
    items[next]?.focus();
  }

  function buildMenu(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'menu-wrap';
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'act';
    t.textContent = MENU_LABEL;
    t.setAttribute('aria-label', MENU_LABEL);
    t.setAttribute('aria-haspopup', 'menu');
    t.setAttribute('aria-expanded', String(menuOpen));
    t.onclick = () => (menuOpen ? closeMenu(false) : openMenu(false));
    t.onkeydown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menuOpen) shadow?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        else openMenu(true);
      }
    };
    trigger = t;
    wrap.append(t);
    if (!menuOpen) return wrap;
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', MENU_LABEL);
    const items: HTMLElement[] = [];
    for (const [id, e] of entries) {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'item';
      it.dataset.id = id;
      it.setAttribute('role', 'menuitem');
      it.tabIndex = -1;
      it.textContent = e.label;
      it.onclick = () => {
        const cb = entries.get(id)?.onClick;
        closeMenu(false);
        cb?.();
      };
      items.push(it);
    }
    menu.onkeydown = (e) => {
      const from = items.findIndex((x) => x === shadow?.activeElement);
      const move = (d: number | 'first' | 'last') => {
        e.preventDefault();
        moveFocus(items, from, d);
      };
      if (e.key === 'ArrowDown') move(1);
      else if (e.key === 'ArrowUp') move(-1);
      else if (e.key === 'Home') move('first');
      else if (e.key === 'End') move('last');
      else if (e.key === 'Tab') closeMenu(false);
    };
    menu.append(...items);
    wrap.append(menu);
    queueMicrotask(() => {
      const target = items.find((x) => x.dataset.id === focusId) ?? items[0];
      if (focusId !== null) target?.focus();
    });
    return wrap;
  }

  function focusedItem(): HTMLElement | null {
    try {
      return (shadow?.activeElement as HTMLElement | null) ?? null;
    } catch {
      return null;
    }
  }

  function render(): void {
    if (entries.size === 0) {
      if (menuOpen) {
        menuOpen = false;
        listen(false);
      }
      host?.remove();
      host = null;
      shadow = null;
      stack = null;
      trigger = null;
      return;
    }
    const parent = ensure();
    const active = focusedItem();
    if (menuOpen && active?.dataset.id) focusId = active.dataset.id;
    if (entries.size < MENU_THRESHOLD && menuOpen) {
      menuOpen = false;
      focusId = null;
      listen(false);
    }
    parent.replaceChildren();
    if (entries.size >= MENU_THRESHOLD) {
      parent.append(buildMenu());
      return;
    }
    trigger = null;
    for (const [id, e] of entries) parent.append(makeButton(id, e));
  }

  return {
    show(id, label, onClick) {
      const prev = entries.get(id);
      entries.set(id, { label, onClick });
      if (prev && prev.label === label) return;
      render();
    },
    hide(id) {
      if (!entries.delete(id)) return;
      render();
    },
  };
}
