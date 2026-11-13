import type { FieldOutcome, FieldReport, FieldRule, Rule, RunReport } from '../model';
import type { AdapterRegistry, FieldAdapter } from '../adapters/types';
import type { LocateFn } from '../locator/types';
import { describeLocator } from '../locator/types';
import type { ResolveResult } from '../expressions';

export interface SessionDeps {
  locate: LocateFn;
  adapters: AdapterRegistry;
  /** Já com o contexto pronto (o integrador injeta). */
  resolveValue(template: string): ResolveResult;
  now(): Date;
  url(): string;
}

/**
 * Uma aparição de contexto (contêiner) durante a qual uma regra é aplicada.
 *
 * Observação: `Behavior.mode` (auto | button | off) NÃO é responsabilidade da
 * sessão; o integrador decide quando chamar `fill`/`handleChange`.
 */
export interface FillSession {
  readonly rule: Rule;
  readonly container: Element;
  /** Avalia campos ainda não vistos: localiza, escolhe adaptador e registra se estava no padrão NESTE momento. Idempotente para campos já vistos. */
  snapshot(): void;
  /** Preenche campos elegíveis e devolve relatório. */
  fill(origin: 'auto' | 'manual'): Promise<RunReport>;
  /** Para campos tardios: snapshot() dos novos + fill dos campos pendentes; null se nada novo foi encontrado. */
  handleChange(): Promise<RunReport | null>;
  /** Campos habilitados ainda não localizados. */
  pendingFields(): readonly string[];
  /** Restaura valores anteriores dos campos preenchidos nesta sessão. */
  undo(): Promise<RunReport>;
  end(): void;
  readonly ended: boolean;
}

type InternalOutcome = FieldOutcome | 'undone';

interface FieldState {
  seen: boolean;
  root?: Element;
  adapter?: FieldAdapter;
  wasDefault?: boolean;
  previousValue: string | null;
  outcome?: InternalOutcome;
  /** Falha ocorrida no snapshot (sem adaptador / leitura lançou); vira 'error' no primeiro fill. */
  snapError?: string;
  newValue?: string;
}

const HANDLED: ReadonlySet<InternalOutcome> = new Set<InternalOutcome>([
  'filled',
  'skipped-not-default',
  'skipped-unresolved-value',
  'error',
  'undone',
]);

type Extra = { newValue?: string; message?: string };

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createSession(rule: Rule, container: Element, deps: SessionDeps): FillSession {
  const states = new Map<string, FieldState>();
  for (const f of rule.fields) states.set(f.id, { seen: false, previousValue: null });
  let ended = false;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  function stateOf(f: FieldRule): FieldState {
    return states.get(f.id) as FieldState;
  }

  function snapshotField(f: FieldRule, st: FieldState): void {
    try {
      const root = deps.locate(f.locator, container);
      if (!root) return;
      st.root = root;
      st.seen = true;
      const adapter = deps.adapters.resolve(root, f.adapter);
      if (!adapter) {
        st.snapError = 'nenhum adaptador compatível';
        return;
      }
      st.adapter = adapter;
      st.previousValue = adapter.read(root);
      st.wasDefault = adapter.isDefault(root, f.defaultValue);
    } catch (e) {
      st.seen = true;
      st.snapError = errMessage(e);
    }
  }

  /** Devolve os ids vistos pela primeira vez nesta chamada. */
  function snapshotNow(): string[] {
    const newlySeen: string[] = [];
    if (ended) return newlySeen;
    for (const f of rule.fields) {
      const st = stateOf(f);
      if (!f.enabled || st.seen) continue;
      snapshotField(f, st);
      if (st.seen) newlySeen.push(f.id);
    }
    return newlySeen;
  }

  function report(
    f: FieldRule,
    st: FieldState,
    outcome: FieldOutcome,
    extra: Extra = {},
  ): FieldReport {
    const r: FieldReport = {
      fieldId: f.id,
      description: describeLocator(f.locator),
      outcome,
      previousValue: st.previousValue,
    };
    if (extra.newValue !== undefined) r.newValue = extra.newValue;
    if (extra.message !== undefined) r.message = extra.message;
    return r;
  }

  function mark(
    f: FieldRule,
    st: FieldState,
    outcome: FieldOutcome,
    extra: Extra = {},
  ): FieldReport {
    st.outcome = outcome;
    st.newValue = extra.newValue;
    return report(f, st, outcome, extra);
  }

  async function attempt(f: FieldRule, st: FieldState): Promise<FieldReport> {
    if (rule.behavior.overwrite === 'onlyIfDefault' && !st.wasDefault) {
      return mark(f, st, 'skipped-not-default');
    }
    const resolved = deps.resolveValue(f.value);
    if (!resolved.ok) {
      return mark(f, st, 'skipped-unresolved-value', { message: resolved.error });
    }
    const adapter = st.adapter as FieldAdapter;
    const root = st.root as Element;
    try {
      await adapter.write(root, resolved.value);
      if (!adapter.verify(root, resolved.value)) {
        return mark(f, st, 'error', {
          message: 'verify-failed: o valor não foi aplicado ao campo',
        });
      }
      return mark(f, st, 'filled', { newValue: resolved.value });
    } catch (e) {
      return mark(f, st, 'error', { message: errMessage(e) });
    }
  }

  function buildReport(origin: 'auto' | 'manual', fields: FieldReport[]): RunReport {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      startedAt: deps.now().toISOString(),
      url: deps.url(),
      origin,
      fields,
    };
  }

  async function fillField(
    f: FieldRule,
    st: FieldState,
    origin: 'auto' | 'manual',
  ): Promise<FieldReport> {
    if (!f.enabled) return report(f, st, 'skipped-disabled');
    if (origin === 'auto') {
      if (st.outcome && HANDLED.has(st.outcome)) return report(f, st, 'skipped-already-handled');
    } else if (st.outcome === 'filled') {
      return report(f, st, 'skipped-already-handled');
    }
    if (!st.seen) return report(f, st, 'not-found');

    if (origin === 'manual') {
      if (!st.adapter) {
        // Tenta de novo localizar/resolver o adaptador.
        st.seen = false;
        st.snapError = undefined;
        st.outcome = undefined;
        snapshotField(f, st);
        if (!st.seen) return report(f, st, 'not-found');
      } else if (st.root) {
        // Reavalia o padrão e o valor anterior AGORA.
        st.snapError = undefined;
        st.previousValue = st.adapter.read(st.root);
        st.wasDefault = st.adapter.isDefault(st.root, f.defaultValue);
      }
    }
    if (st.snapError !== undefined) return mark(f, st, 'error', { message: st.snapError });
    return attempt(f, st);
  }

  async function fillNow(origin: 'auto' | 'manual'): Promise<RunReport> {
    const fields: FieldReport[] = [];
    if (ended) return buildReport(origin, fields);
    snapshotNow();
    for (const f of rule.fields) {
      const st = stateOf(f);
      try {
        fields.push(await fillField(f, st, origin));
      } catch (e) {
        fields.push(mark(f, st, 'error', { message: errMessage(e) }));
      }
    }
    return buildReport(origin, fields);
  }

  async function undoNow(): Promise<RunReport> {
    const fields: FieldReport[] = [];
    if (ended) return buildReport('manual', fields);
    for (const f of rule.fields) {
      const st = stateOf(f);
      if (st.outcome !== 'filled' || !st.adapter || !st.root) continue;
      const base = { fieldId: f.id, description: describeLocator(f.locator) };
      try {
        const prev = st.previousValue;
        if (st.adapter.id === 'vue-multiselect' && (prev === null || prev === '')) {
          fields.push({
            ...base,
            outcome: 'error',
            previousValue: prev,
            message: 'não é possível desfazer seleção',
          });
          continue;
        }
        const restore = prev ?? '';
        await st.adapter.write(st.root, restore);
        st.outcome = 'undone';
        fields.push({
          ...base,
          outcome: 'filled',
          previousValue: st.newValue ?? null,
          newValue: restore,
          message: 'desfeito',
        });
      } catch (e) {
        fields.push({
          ...base,
          outcome: 'error',
          previousValue: st.previousValue,
          message: errMessage(e),
        });
      }
    }
    return buildReport('manual', fields);
  }

  function pending(): string[] {
    return rule.fields.filter((f) => f.enabled && !stateOf(f).seen).map((f) => f.id);
  }

  return {
    rule,
    container,
    get ended() {
      return ended;
    },
    snapshot() {
      snapshotNow();
    },
    fill(origin) {
      return enqueue(() => fillNow(origin));
    },
    handleChange() {
      return enqueue(async () => {
        if (ended || pending().length === 0) return null;
        if (snapshotNow().length === 0) return null;
        return fillNow('auto');
      });
    },
    pendingFields() {
      return pending();
    },
    undo() {
      return enqueue(undoNow);
    },
    end() {
      ended = true;
    },
  };
}
