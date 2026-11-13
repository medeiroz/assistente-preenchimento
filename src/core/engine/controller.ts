import type { FieldReport, Rule, RunReport } from '../model';
import { createDefaultRegistry } from '../adapters';
import { locate } from '../locator';
import { resolveValue } from '../expressions';
import { rulesForUrl } from './matcher';
import { createContextWatcher, createUrlWatcher } from './watcher';
import type { ContextWatcher, UrlWatcher } from './watcher';
import { createSession } from './session';
import type { FillSession } from './session';

export interface ControllerOptions {
  window: Window;
  rules: Rule[];
  variables?: Record<string, string>;
  ui: { showReport(r: RunReport): void; highlight(roots: Element[]): void };
  onReport?(r: RunReport): void;
}

export interface Controller {
  start(): void;
  stop(): void;
  runNow(ruleId?: string): Promise<RunReport[]>;
  lastReport(): RunReport | null;
  setRules(rules: Rule[]): void;
  setVariables(vars: Record<string, string>): void;
  undo(ruleId?: string): Promise<RunReport[]>;
  /** Regras com watcher ativo para a URL atual. */
  activeRules(): Rule[];
}

interface Entry {
  session: FillSession;
  /** Último resultado conhecido por campo (para relatórios cumulativos de campos tardios). */
  fields: Map<string, FieldReport>;
}

interface Active {
  rule: Rule;
  watcher: ContextWatcher | null;
  /** Timer de aparição de regras sem contêiner. */
  timer: ReturnType<typeof setTimeout> | undefined;
  entries: Map<Element, Entry>;
}

const NOTABLE = new Set(['filled', 'error', 'not-found']);

export function createController(o: ControllerOptions): Controller {
  const win = o.window;
  const adapters = createDefaultRegistry();
  let rules = o.rules;
  let variables = o.variables ?? {};
  let running = false;
  let last: RunReport | null = null;
  let urlWatcher: UrlWatcher | undefined;
  const active = new Map<string, Active>();

  function reportResult(a: Active, entry: Entry, raw: RunReport, shown: RunReport = raw): void {
    for (const f of raw.fields) {
      if (f.outcome !== 'skipped-already-handled' || !entry.fields.has(f.fieldId)) {
        entry.fields.set(f.fieldId, f);
      }
    }
    last = shown;
    o.onReport?.(shown);
    if (shown.fields.some((f) => NOTABLE.has(f.outcome))) o.ui.showReport(shown);
    const roots: Element[] = [];
    for (const f of raw.fields) {
      if (f.outcome !== 'filled') continue;
      const fr = a.rule.fields.find((x) => x.id === f.fieldId);
      const root = fr ? locate(fr.locator, entry.session.container) : null;
      if (root) roots.push(root);
    }
    if (roots.length > 0) o.ui.highlight(roots);
  }

  function makeSession(rule: Rule, el: Element): FillSession {
    const fieldValue = (label: string): string | null => {
      const root = locate({ by: 'label', text: label }, el);
      if (!root) return null;
      return adapters.resolve(root, 'auto')?.read(root) ?? null;
    };
    return createSession(rule, el, {
      locate,
      adapters,
      resolveValue: (template) =>
        resolveValue(template, {
          variables,
          url: new URL(win.location.href),
          now: new Date(),
          field: fieldValue,
          text: (sel) => win.document.querySelector(sel)?.textContent?.trim() ?? null,
        }),
      now: () => new Date(),
      url: () => win.location.href,
    });
  }

  function onAppear(a: Active, el: Element): void {
    if (!running) return;
    a.entries.get(el)?.session.end();
    const entry: Entry = { session: makeSession(a.rule, el), fields: new Map() };
    a.entries.set(el, entry);
    entry.session.snapshot();
    if (a.rule.behavior.mode !== 'auto') return;
    entry.session
      .fill('auto')
      .then((r) => {
        if (running && !entry.session.ended) reportResult(a, entry, r);
      })
      .catch((e: unknown) => console.warn('[assistente] falha ao preencher', e));
  }

  function onChange(a: Active, el: Element): void {
    const entry = a.entries.get(el);
    if (!running || !entry) return;
    if (a.rule.behavior.mode !== 'auto') {
      entry.session.snapshot();
      return;
    }
    entry.session
      .handleChange()
      .then((r) => {
        if (!r || !running || entry.session.ended) return;
        const fields = r.fields.map((f) =>
          f.outcome === 'skipped-already-handled' ? (entry.fields.get(f.fieldId) ?? f) : f,
        );
        reportResult(a, entry, r, { ...r, fields });
      })
      .catch((e: unknown) => console.warn('[assistente] falha ao preencher', e));
  }

  function onGone(a: Active, el: Element): void {
    a.entries.get(el)?.session.end();
    a.entries.delete(el);
  }

  function stopActive(a: Active): void {
    a.watcher?.stop();
    if (a.timer !== undefined) clearTimeout(a.timer);
    a.timer = undefined;
    for (const e of a.entries.values()) e.session.end();
    a.entries.clear();
  }

  function startActive(rule: Rule): void {
    const a: Active = { rule, watcher: null, timer: undefined, entries: new Map() };
    active.set(rule.id, a);
    const container = rule.trigger.container;
    if (container) {
      a.watcher = createContextWatcher({
        document: win.document,
        container,
        settleMs: rule.trigger.settleMs,
        onAppear: (el) => onAppear(a, el),
        onGone: (el) => onGone(a, el),
        onChange: (el) => onChange(a, el),
      });
      a.watcher.start();
    } else {
      a.timer = setTimeout(() => {
        a.timer = undefined;
        onAppear(a, win.document.body);
      }, rule.trigger.settleMs);
    }
  }

  /** Reconcilia os watchers com as regras que valem para a URL atual. */
  function sync(urlChanged: boolean): void {
    const wanted = rulesForUrl(rules, win.location.href);
    for (const [id, a] of [...active]) {
      const w = wanted.find((r) => r.id === id);
      const changed = !!w && w !== a.rule && JSON.stringify(w) !== JSON.stringify(a.rule);
      const restart = !w || changed || (urlChanged && !a.rule.trigger.container);
      if (!restart && w) a.rule = w;
      if (restart) {
        stopActive(a);
        active.delete(id);
      }
    }
    for (const rule of wanted) if (!active.has(rule.id)) startActive(rule);
  }

  return {
    start() {
      if (running) return;
      running = true;
      sync(false);
      urlWatcher = createUrlWatcher(win, () => sync(true));
      urlWatcher.start();
    },
    stop() {
      running = false;
      urlWatcher?.stop();
      urlWatcher = undefined;
      for (const a of active.values()) stopActive(a);
      active.clear();
    },
    async runNow(ruleId) {
      const out: RunReport[] = [];
      for (const a of [...active.values()]) {
        if (ruleId !== undefined && a.rule.id !== ruleId) continue;
        for (const entry of [...a.entries.values()]) {
          const r = await entry.session.fill('manual');
          reportResult(a, entry, r);
          out.push(r);
        }
      }
      return out;
    },
    async undo(ruleId) {
      const out: RunReport[] = [];
      for (const a of [...active.values()]) {
        if (ruleId !== undefined && a.rule.id !== ruleId) continue;
        for (const entry of [...a.entries.values()]) {
          const r = await entry.session.undo();
          last = r;
          o.ui.showReport(r);
          out.push(r);
        }
      }
      return out;
    },
    activeRules: () => [...active.values()].map((a) => a.rule),
    setVariables(vars) {
      variables = vars;
    },
    lastReport: () => last,
    setRules(next) {
      rules = next;
      if (running) sync(false);
    },
  };
}
