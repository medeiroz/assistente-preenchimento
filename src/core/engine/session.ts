import type { FieldOutcome, FieldReport, FieldRule, Rule, RunReport } from '../model';
import type { AdapterRegistry, FieldAdapter } from '../adapters/types';
import type { LocateFn } from '../locator/types';
import { describeLocator } from '../locator/types';
import type { ResolveResult } from '../expressions';
import { t } from '../i18n';

export interface SessionDeps {
  locate: LocateFn;
  adapters: AdapterRegistry;
  /** Já com o contexto pronto (o integrador injeta). */
  resolveValue(template: string): ResolveResult;
  now(): Date;
  url(): string;
  /** Espera injetável (testes). Padrão: setTimeout. A sessão a interrompe ao terminar. */
  sleep?: (ms: number) => Promise<void>;
  /** Nome da OUTRA regra que já preencheu esta raiz de campo neste contêiner (null = livre). */
  claimedBy?(root: Element): string | null;
  /** Registra que esta sessão preencheu a raiz do campo. */
  claim?(root: Element): void;
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

interface FieldState {
  seen: boolean;
  root?: Element;
  adapter?: FieldAdapter;
  wasDefault?: boolean;
  previousValue: string | null;
  outcome?: FieldOutcome;
  /** Falha ocorrida no snapshot (sem adaptador / leitura lançou); vira 'error' no primeiro fill. */
  snapError?: string;
  newValue?: string;
}

const HANDLED: ReadonlySet<FieldOutcome> = new Set<FieldOutcome>([
  'filled',
  'skipped-already-handled',
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
  const timers = new Set<{ timer: ReturnType<typeof setTimeout>; wake: () => void }>();
  let wakeEnd: () => void = () => undefined;
  const endSignal = new Promise<void>((resolve) => {
    wakeEnd = resolve;
  });
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Espera `ms`; volta antes se a sessão terminar (sem deixar timer pendente). */
  function sleep(ms: number): Promise<void> {
    if (ended || ms <= 0) return Promise.resolve();
    if (deps.sleep) return Promise.race([deps.sleep(ms), endSignal]);
    return new Promise<void>((resolve) => {
      const entry = {
        timer: setTimeout(() => {
          timers.delete(entry);
          resolve();
        }, ms),
        wake: resolve,
      };
      timers.add(entry);
    });
  }

  /**
   * Atraso por campo: espera ANTES de localizar (o campo pode só surgir depois do anterior
   * disparar uma busca) e então localiza/avalia de novo, pois o nó pode ter mudado.
   */
  async function applyDelay(f: FieldRule, st: FieldState): Promise<void> {
    if (!f.delayMs || !f.enabled) return;
    await sleep(f.delayMs);
    if (ended) return;
    st.seen = false;
    st.snapError = undefined;
    st.adapter = undefined;
    st.root = undefined;
    snapshotField(f, st);
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
        st.snapError = t('engNoAdapter');
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

  /** Raiz já preenchida por outra regra neste contêiner: o campo é pulado com o motivo. */
  function skipIfClaimed(f: FieldRule, st: FieldState): FieldReport | null {
    const owner = st.root ? deps.claimedBy?.(st.root) : null;
    if (!owner) return null;
    return mark(f, st, 'skipped-already-handled', {
      message: t('engFilledByRule', owner),
    });
  }

  async function attempt(f: FieldRule, st: FieldState): Promise<FieldReport> {
    const claimed = skipIfClaimed(f, st);
    if (claimed) return claimed;
    if (rule.behavior.overwrite === 'onlyIfDefault' && !st.wasDefault) {
      return mark(f, st, 'skipped-not-default');
    }
    const resolved = deps.resolveValue(f.value);
    if (!resolved.ok) {
      return mark(f, st, 'skipped-unresolved-value', { message: resolved.error });
    }
    return write(f, st, resolved.value);
  }

  async function write(f: FieldRule, st: FieldState, value: string): Promise<FieldReport> {
    const adapter = st.adapter as FieldAdapter;
    const root = st.root as Element;
    try {
      const opts = f.typing ? { typing: f.typing, sleep, aborted: () => ended } : undefined;
      await adapter.write(root, value, opts);
      if (ended) return report(f, st, 'error', { message: t('engSessionEnded') });
      if (!adapter.verify(root, value, opts)) {
        return mark(f, st, 'error', {
          message: t('engVerifyFailed'),
        });
      }
      deps.claim?.(root);
      return mark(f, st, 'filled', { newValue: value });
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

  /**
   * "Preencher agora": o clique expressa intenção de preencher, então o campo é reavaliado
   * AGORA (valor resolvido, valor atual, padrão), sem depender do que a sessão já tratou.
   */
  async function fillFieldManual(f: FieldRule, st: FieldState): Promise<FieldReport> {
    if (!f.enabled) return report(f, st, 'skipped-disabled');
    if (!st.seen) return report(f, st, 'not-found');
    if (!st.adapter) {
      // Tenta de novo localizar/resolver o adaptador.
      st.seen = false;
      st.snapError = undefined;
      st.outcome = undefined;
      snapshotField(f, st);
      if (!st.seen) return report(f, st, 'not-found');
    }
    if (st.snapError !== undefined) return mark(f, st, 'error', { message: st.snapError });

    const claimed = skipIfClaimed(f, st);
    if (claimed) return claimed;
    const adapter = st.adapter as FieldAdapter;
    const root = st.root as Element;
    const resolved = deps.resolveValue(f.value);
    if (!resolved.ok) {
      return mark(f, st, 'skipped-unresolved-value', { message: resolved.error });
    }
    const current = adapter.read(root);
    if (current === resolved.value) {
      // Já preenchido por esta sessão: preserva 'filled' (e o valor anterior) para o Desfazer.
      if (st.outcome === 'filled') {
        return report(f, st, 'skipped-already-handled', { message: t('engAlreadyHasValue') });
      }
      st.previousValue = current;
      return mark(f, st, 'skipped-already-handled', { message: t('engAlreadyHasValue') });
    }
    st.previousValue = current;
    st.wasDefault = adapter.isDefault(root, f.defaultValue);
    if (rule.behavior.overwrite === 'onlyIfDefault' && !st.wasDefault) {
      return mark(f, st, 'skipped-not-default');
    }
    return write(f, st, resolved.value);
  }

  async function fillField(
    f: FieldRule,
    st: FieldState,
    origin: 'auto' | 'manual',
  ): Promise<FieldReport> {
    if (origin === 'manual') return fillFieldManual(f, st);
    if (!f.enabled) return report(f, st, 'skipped-disabled');
    if (st.outcome && HANDLED.has(st.outcome)) return report(f, st, 'skipped-already-handled');
    if (!st.seen) return report(f, st, 'not-found');
    if (st.snapError !== undefined) return mark(f, st, 'error', { message: st.snapError });
    return attempt(f, st);
  }

  async function fillNow(origin: 'auto' | 'manual'): Promise<RunReport> {
    const fields: FieldReport[] = [];
    if (ended) return buildReport(origin, fields);
    snapshotNow();
    for (const f of rule.fields) {
      const st = stateOf(f);
      if (ended) break;
      try {
        if (origin === 'manual' || !(st.outcome && HANDLED.has(st.outcome))) {
          await applyDelay(f, st);
          if (ended) break;
        }
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
        const hadValue = prev !== null && prev !== '';
        if (!hadValue && !st.adapter.clear) {
          fields.push({
            ...base,
            outcome: 'error',
            previousValue: st.newValue ?? null,
            message: t('engCannotUndo'),
          });
          continue;
        }
        if (hadValue) await st.adapter.write(st.root, prev);
        else await st.adapter.clear?.(st.root);
        st.outcome = 'undone';
        fields.push({
          ...base,
          outcome: 'undone',
          previousValue: st.newValue ?? null,
          newValue: hadValue ? prev : '',
        });
      } catch (e) {
        fields.push({
          ...base,
          outcome: 'error',
          previousValue: st.newValue ?? null,
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
      for (const t of timers) {
        clearTimeout(t.timer);
        t.wake();
      }
      timers.clear();
      wakeEnd();
    },
  };
}
