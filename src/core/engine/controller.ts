import type { FieldReport, Rule, RunReport } from '../model';
import { createDefaultRegistry } from '../adapters';
import { deepQuery, locate } from '../locator';
import { resolveValue } from '../expressions';
import { frameUrlOf, rulesForFrame } from './matcher';
import { createContextWatcher, createUrlWatcher } from './watcher';
import type { ContextWatcher, UrlWatcher } from './watcher';
import { rulePriority } from '../model/schema';
import { createSession } from './session';
import type { FillSession } from './session';
import { t } from '../i18n';

export interface ControllerOptions {
  window: Window;
  rules: Rule[];
  variables?: Record<string, string>;
  ui: {
    showReport(r: RunReport, actions?: { undo?: () => void }): void;
    highlight(roots: Element[]): void;
    showActionButton(id: string, label: string, onClick: () => void): void;
    hideActionButton(id: string): void;
  };
  onReport?(r: RunReport): void;
  /** Frame filho (padrão: topo). Num filho só rodam regras com `frames: 'all'`. */
  isTopFrame?: boolean;
  /** Regras ativas ou último relatório mudaram (alimenta o registro de frames). */
  onStateChange?(): void;
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

interface Batch {
  items: { a: Active; entry: Entry }[];
  timer: ReturnType<typeof setTimeout>;
}

const NOTABLE = new Set(['filled', 'error', 'not-found', 'undone']);

export function createController(o: ControllerOptions): Controller {
  const win = o.window;
  const isTop = o.isTopFrame ?? true;
  const currentUrl = (): string => frameUrlOf(win);
  const adapters = createDefaultRegistry();
  let rules = o.rules;
  let variables = o.variables ?? {};
  let running = false;
  let last: RunReport | null = null;
  let urlWatcher: UrlWatcher | undefined;
  const active = new Map<string, Active>();
  /** Fila de preenchimentos por contêiner: regras do mesmo contêiner rodam em sequência. */
  const chains = new Map<Element, Promise<unknown>>();
  /** Aparições automáticas do mesmo contêiner agrupadas para ordenar por prioridade. */
  const batches = new Map<Element, Batch>();
  /** Raízes de campo preenchidas, por contêiner: raiz -> regra que a reivindicou. */
  const claims = new Map<Element, Map<Element, { ruleId: string; name: string }>>();

  function enqueue<T>(el: Element, task: () => Promise<T>): Promise<T> {
    const run = (chains.get(el) ?? Promise.resolve()).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    chains.set(el, tail);
    void tail.then(() => {
      if (chains.get(el) === tail) chains.delete(el);
    });
    return run;
  }

  function releaseClaims(ruleId: string, el?: Element): void {
    for (const [container, map] of [...claims]) {
      if (el && container !== el) continue;
      for (const [root, c] of [...map]) if (c.ruleId === ruleId) map.delete(root);
      if (map.size === 0) claims.delete(container);
    }
  }

  function flushBatch(el: Element): void {
    const batch = batches.get(el);
    batches.delete(el);
    if (!batch) return;
    const order = (r: Rule) => rules.findIndex((x) => x.id === r.id);
    const sorted = [...batch.items].sort(
      (x, y) =>
        rulePriority(y.a.rule) - rulePriority(x.a.rule) || order(x.a.rule) - order(y.a.rule),
    );
    for (const { a, entry } of sorted) {
      if (!running || entry.session.ended || a.entries.get(el) !== entry) continue;
      enqueue(el, () => entry.session.fill('auto'))
        .then((r) => {
          if (running && !entry.session.ended) reportResult(a, entry, r);
        })
        .catch((e: unknown) => console.warn('[assistente] falha ao preencher', e));
    }
  }

  function scheduleAuto(a: Active, el: Element, entry: Entry): void {
    let batch = batches.get(el);
    if (!batch) {
      batch = { items: [], timer: setTimeout(() => flushBatch(el), 0) };
      batches.set(el, batch);
    }
    batch.items.push({ a, entry });
  }

  function reportResult(a: Active, entry: Entry, raw: RunReport, shown: RunReport = raw): void {
    for (const f of raw.fields) {
      if (f.outcome !== 'skipped-already-handled' || !entry.fields.has(f.fieldId)) {
        entry.fields.set(f.fieldId, f);
      }
    }
    last = shown;
    o.onReport?.(shown);
    o.onStateChange?.();
    if (shown.fields.some((f) => NOTABLE.has(f.outcome))) {
      const canUndo = shown.fields.some((f) => f.outcome === 'filled');
      if (canUndo) {
        o.ui.showReport(shown, {
          undo: () => {
            doUndo(a.rule.id).catch((e: unknown) =>
              console.warn('[assistente] falha ao desfazer', e),
            );
          },
        });
      } else {
        o.ui.showReport(shown);
      }
    }
    const roots: Element[] = [];
    for (const f of raw.fields) {
      if (f.outcome !== 'filled') continue;
      const fr = a.rule.fields.find((x) => x.id === f.fieldId);
      const root = fr ? locate(fr.locator, entry.session.container) : null;
      if (root) roots.push(root);
    }
    if (roots.length > 0) o.ui.highlight(roots);
  }

  async function doUndo(ruleId?: string): Promise<RunReport[]> {
    const out: RunReport[] = [];
    for (const a of [...active.values()]) {
      if (ruleId !== undefined && a.rule.id !== ruleId) continue;
      for (const [el, entry] of [...a.entries]) {
        const r = await enqueue(el, () => entry.session.undo());
        releaseClaims(a.rule.id, el);
        last = r;
        o.onStateChange?.();
        o.ui.showReport(r);
        out.push(r);
      }
    }
    return out;
  }

  function showButton(a: Active): void {
    o.ui.showActionButton(a.rule.id, t('fillRuleLabel', a.rule.name), () => {
      if (!running || active.get(a.rule.id) !== a) return;
      o.ui.hideActionButton(a.rule.id);
      for (const [el, entry] of [...a.entries]) {
        enqueue(el, () => entry.session.fill('auto'))
          .then((r) => {
            if (running && !entry.session.ended) reportResult(a, entry, r);
          })
          .catch((e: unknown) => console.warn('[assistente] falha ao preencher', e));
      }
    });
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
          url: new URL(currentUrl()),
          now: new Date(),
          field: fieldValue,
          text: (sel) => deepQuery.querySelector(win.document, sel)?.textContent?.trim() ?? null,
        }),
      now: () => new Date(),
      url: currentUrl,
      claimedBy: (root) => {
        const c = claims.get(el)?.get(root);
        return c && c.ruleId !== rule.id ? c.name : null;
      },
      claim: (root) => {
        let map = claims.get(el);
        if (!map) claims.set(el, (map = new Map()));
        map.set(root, { ruleId: rule.id, name: rule.name });
      },
    });
  }

  function onAppear(a: Active, el: Element): void {
    if (!running) return;
    a.entries.get(el)?.session.end();
    releaseClaims(a.rule.id, el);
    const entry: Entry = { session: makeSession(a.rule, el), fields: new Map() };
    a.entries.set(el, entry);
    entry.session.snapshot();
    if (a.rule.behavior.mode === 'button') {
      showButton(a);
      return;
    }
    if (a.rule.behavior.mode !== 'auto') return;
    scheduleAuto(a, el, entry);
  }

  function onChange(a: Active, el: Element): void {
    const entry = a.entries.get(el);
    if (!running || !entry) return;
    if (a.rule.behavior.mode !== 'auto') {
      entry.session.snapshot();
      return;
    }
    enqueue(el, () => entry.session.handleChange())
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
    releaseClaims(a.rule.id, el);
    if (a.entries.size === 0) o.ui.hideActionButton(a.rule.id);
  }

  function stopActive(a: Active): void {
    a.watcher?.stop();
    if (a.timer !== undefined) clearTimeout(a.timer);
    a.timer = undefined;
    for (const e of a.entries.values()) e.session.end();
    a.entries.clear();
    releaseClaims(a.rule.id);
    o.ui.hideActionButton(a.rule.id);
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
    const wanted = rulesForFrame(rules, currentUrl(), isTop);
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
    o.onStateChange?.();
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
      for (const b of batches.values()) clearTimeout(b.timer);
      batches.clear();
      chains.clear();
      claims.clear();
      o.onStateChange?.();
    },
    async runNow(ruleId) {
      const out: RunReport[] = [];
      for (const a of [...active.values()]) {
        if (ruleId !== undefined && a.rule.id !== ruleId) continue;
        for (const [el, entry] of [...a.entries]) {
          const r = await enqueue(el, () => entry.session.fill('manual'));
          reportResult(a, entry, r);
          out.push(r);
        }
      }
      return out;
    },
    undo: doUndo,
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
