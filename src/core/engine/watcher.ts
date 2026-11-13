import type { Trigger } from '../model/schema';
import { containerMatches } from './matcher';

export interface ContextWatcherOptions {
  document: Document;
  container: NonNullable<Trigger['container']>;
  settleMs: number;
  /** Contexto passou a existir/ficar ativo e ficou estável por settleMs. */
  onAppear(el: Element): void;
  /** Contexto saiu do DOM ou deixou de casar com o seletor. */
  onGone(el: Element): void;
  /** Mutações dentro de um contexto já aparecido (debounced por settleMs). */
  onChange?(el: Element): void;
}

export interface ContextWatcher {
  start(): void;
  stop(): void;
  active(): readonly Element[];
}

interface Tracked {
  appeared: boolean;
  settleTimer: ReturnType<typeof setTimeout> | undefined;
  changeTimer: ReturnType<typeof setTimeout> | undefined;
}

export function createContextWatcher(o: ContextWatcherOptions): ContextWatcher {
  const tracked = new Map<Element, Tracked>();
  let observer: MutationObserver | undefined;
  let evalTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  function clearTimers(t: Tracked): void {
    if (t.settleTimer !== undefined) clearTimeout(t.settleTimer);
    if (t.changeTimer !== undefined) clearTimeout(t.changeTimer);
    t.settleTimer = undefined;
    t.changeTimer = undefined;
  }

  function armSettle(el: Element, t: Tracked): void {
    if (t.settleTimer !== undefined) clearTimeout(t.settleTimer);
    t.settleTimer = setTimeout(() => {
      t.settleTimer = undefined;
      if (!running || tracked.get(el) !== t) return;
      t.appeared = true;
      o.onAppear(el);
    }, o.settleMs);
  }

  function armChange(el: Element, t: Tracked): void {
    if (t.changeTimer !== undefined) clearTimeout(t.changeTimer);
    t.changeTimer = setTimeout(() => {
      t.changeTimer = undefined;
      if (!running || tracked.get(el) !== t) return;
      o.onChange?.(el);
    }, o.settleMs);
  }

  function evaluate(): void {
    if (!running) return;
    const current = new Set<Element>();
    for (const el of o.document.querySelectorAll(o.container.selector)) {
      if (containerMatches(el, o.container)) current.add(el);
    }
    for (const [el, t] of [...tracked]) {
      if (current.has(el)) continue;
      tracked.delete(el);
      clearTimers(t);
      if (t.appeared) o.onGone(el);
    }
    for (const el of current) {
      if (tracked.has(el)) continue;
      const t: Tracked = { appeared: false, settleTimer: undefined, changeTimer: undefined };
      tracked.set(el, t);
      armSettle(el, t);
    }
  }

  function scheduleEvaluate(): void {
    if (evalTimer !== undefined) return;
    evalTimer = setTimeout(() => {
      evalTimer = undefined;
      evaluate();
    }, 0);
  }

  function onMutations(records: MutationRecord[]): void {
    for (const [el, t] of tracked) {
      if (records.some((r) => el.contains(r.target))) {
        if (t.appeared) armChange(el, t);
        else armSettle(el, t);
      }
    }
    scheduleEvaluate();
  }

  return {
    start() {
      if (running) return;
      running = true;
      observer = new MutationObserver(onMutations);
      observer.observe(o.document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
      evaluate();
    },
    stop() {
      running = false;
      observer?.disconnect();
      observer = undefined;
      if (evalTimer !== undefined) clearTimeout(evalTimer);
      evalTimer = undefined;
      for (const t of tracked.values()) clearTimers(t);
      tracked.clear();
    },
    active() {
      return [...tracked].filter(([, t]) => t.appeared).map(([el]) => el);
    },
  };
}

export interface UrlWatcher {
  start(): void;
  stop(): void;
}

/** Observa mudanças de URL: popstate, hashchange e patch de pushState/replaceState. */
export function createUrlWatcher(win: Window, onChange: (url: string) => void): UrlWatcher {
  let last = '';
  let started = false;
  let origPush: History['pushState'] | undefined;
  let origReplace: History['replaceState'] | undefined;
  let patchedPush: History['pushState'] | undefined;
  let patchedReplace: History['replaceState'] | undefined;

  function check(): void {
    const href = win.location.href;
    if (href === last) return;
    last = href;
    onChange(href);
  }

  return {
    start() {
      if (started) return;
      started = true;
      last = win.location.href;
      const hist = win.history;
      const push = hist.pushState;
      const replace = hist.replaceState;
      origPush = push;
      origReplace = replace;
      patchedPush = function (this: History, ...args: Parameters<History['pushState']>) {
        push.apply(this, args);
        check();
      };
      patchedReplace = function (this: History, ...args: Parameters<History['replaceState']>) {
        replace.apply(this, args);
        check();
      };
      hist.pushState = patchedPush;
      hist.replaceState = patchedReplace;
      win.addEventListener('popstate', check);
      win.addEventListener('hashchange', check);
    },
    stop() {
      if (!started) return;
      started = false;
      const hist = win.history;
      if (origPush && hist.pushState === patchedPush) hist.pushState = origPush;
      if (origReplace && hist.replaceState === patchedReplace) hist.replaceState = origReplace;
      win.removeEventListener('popstate', check);
      win.removeEventListener('hashchange', check);
    },
  };
}
