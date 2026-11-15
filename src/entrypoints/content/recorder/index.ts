import { createDefaultRegistry } from '../../../core/adapters';
import { buildCapture, resolveField } from '../../../core/locator';
import type { Capture, FieldHit } from '../../../core/locator';
import type { RecordedField, RecorderStatus } from '../../../core/recorder/types';
import { fieldKey } from '../../../core/recorder/session';
import { ACTION_HOST_ATTR, TOAST_HOST_ATTR } from '../page-ui';
import { PICKER_HOST_ATTR } from '../picker';
import { createRecorderBar, RECORDER_HOST_ATTR, type RecorderBar } from './bar';

export { RECORDER_HOST_ATTR } from './bar';

const EVENTS = ['input', 'change', 'click', 'focusin', 'focusout', 'keydown', 'keyup'] as const;
/** Eventos que disparam a releitura dos campos tocados (widgets que mudam valor por overlay). */
const RESCAN_EVENTS = ['click', 'keyup', 'focusin', 'focusout'];
/** Teclas que podem confirmar/fechar um widget; as demais (caracteres) não pedem releitura. */
const RESCAN_KEYS = new Set(['Enter', 'Tab', 'Escape', ' ', 'Spacebar']);
const RESCAN_KEY = /^Arrow/;
/** Saídas da página: o que ainda estiver pendente precisa ir embora agora. */
const LEAVE_EVENTS = ['submit', 'pagehide', 'beforeunload'] as const;
const INPUT_DEBOUNCE_MS = 300;
const CLICK_DEBOUNCE_MS = 150;
const RESCAN_MS = [200, 600];
const MAX_TOUCHED = 50;

const OWN_HOST_ATTRS = [RECORDER_HOST_ATTR, PICKER_HOST_ATTR, TOAST_HOST_ATTR, ACTION_HOST_ATTR];
const SENSITIVE_AUTOCOMPLETE = ['current-password', 'new-password', 'one-time-code'];

export interface RecorderDeps {
  win?: Window;
  /** Envia o campo ao background; resolve com o estado atualizado da gravação. */
  send(field: RecordedField): Promise<RecorderStatus>;
  /** Barra da página: "Parar e criar regras" (`false`) ou "Descartar" (`true`). */
  onStop(discard: boolean): void;
  now?(): number;
  /** Só eventos de usuário contam. Padrão: `ev.isTrusted` (os do motor de preenchimento são sintéticos). */
  isTrusted?(ev: Event): boolean;
  /** Pausa a observação (ex.: enquanto o seletor de campos está ativo). */
  isPaused?(): boolean;
}

export interface Recorder {
  start(status: RecorderStatus): void;
  update(status: RecorderStatus): void;
  stop(): void;
  /** Reporta já tudo o que está pendente (debounce), sem esperar os timers. */
  flush(): void;
  readonly active: boolean;
}

/** Captura já montada de um campo (localizador, adapter, contêiner) + se é sensível. */
interface KnownField {
  capture: Capture;
  sensitive: boolean;
}

function isRescanKey(ev: Event): boolean {
  const key = (ev as KeyboardEvent).key;
  return typeof key === 'string' && (RESCAN_KEYS.has(key) || RESCAN_KEY.test(key));
}

function isElement(x: EventTarget | null | undefined): x is Element {
  return x !== null && x !== undefined && (x as Node).nodeType === 1;
}

function isSensitiveControl(el: Element): boolean {
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return false;
  if ((el.getAttribute('type') ?? '').toLowerCase() === 'password') return true;
  const tokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/);
  return tokens.some((t) => t.startsWith('cc-') || SENSITIVE_AUTOCOMPLETE.includes(t));
}

function isSensitive(root: Element, target: Element): boolean {
  if (isSensitiveControl(target) || isSensitiveControl(root)) return true;
  return Array.from(root.querySelectorAll('input, textarea, select')).some(isSensitiveControl);
}

/**
 * Gravador de preenchimento: observa o que o usuário digita/escolhe e reporta cada campo
 * (com o valor final) via `send`. Listeners passivos no `window`, em fase de captura; nunca
 * cancela nem dispara eventos, para o site não perceber a gravação.
 */
export function createRecorder(deps: RecorderDeps): Recorder {
  const win = deps.win ?? window;
  const doc = win.document;
  const now = deps.now ?? Date.now;
  const trusted = deps.isTrusted ?? ((ev: Event) => ev.isTrusted);
  let bar: RecorderBar | null = null;
  let count = 0;
  const paused = deps.isPaused ?? (() => false);
  const timers = new Map<Element, { timer: ReturnType<typeof setTimeout>; target: Element }>();
  const lastSent = new Map<string, string>();
  /** Campos com os quais o usuário interagiu; só eles são relidos após cliques em overlays. */
  const touched = new Set<Element>();
  let rescanTimers: ReturnType<typeof setTimeout>[] = [];
  const registry = createDefaultRegistry();
  /** `resolveField` por alvo do evento: evita refazer a busca de rótulo a cada tecla/clique. */
  const hitCache = new WeakMap<Element, FieldHit | null>();
  /** Captura de cada raiz já vista; nas releituras só o valor atual é lido (via adapter). */
  const known = new Map<Element, KnownField>();

  function cachedHit(target: Element): FieldHit | null | undefined {
    const hit = hitCache.get(target);
    if (hit && !hit.root.isConnected) {
      hitCache.delete(target);
      return undefined;
    }
    return hit;
  }

  function hitFor(target: Element): FieldHit | null {
    const cached = cachedHit(target);
    if (cached !== undefined) return cached;
    const hit = resolveField(target);
    hitCache.set(target, hit);
    return hit;
  }

  /** Captura da raiz: reaproveita a já montada, atualizando só o valor atual. */
  function captureFor(root: Element, target: Element): KnownField | null {
    for (const el of Array.from(known.keys())) if (!el.isConnected) known.delete(el);
    const prev = known.get(root);
    if (prev && root.isConnected) {
      const adapter = registry.resolve(root, prev.capture.adapter);
      prev.capture.currentValue = adapter ? adapter.read(root) : null;
      return prev;
    }
    const el = root.isConnected ? root : target;
    if (!el.isConnected) return null;
    const capture = buildCapture(el, doc, win.location.href);
    if (!capture) return null;
    const entry = { capture, sensitive: isSensitive(root, target) };
    if (root.isConnected) known.set(root, entry);
    return entry;
  }

  function fromOwnUi(ev: Event): boolean {
    if (bar?.owns(ev)) return true;
    return ev
      .composedPath()
      .some((n) => isElement(n) && OWN_HOST_ATTRS.some((a) => n.hasAttribute(a)));
  }

  function setCount(n: number): void {
    count = n;
    bar?.setCount(n);
  }

  function report(root: Element, target: Element, skipUnseenEmpty = false): void {
    timers.delete(root);
    if (!bar) return;
    const entry = captureFor(root, target);
    if (!entry || entry.sensitive) return;
    const capture = entry.capture;
    const value = capture.currentValue ?? '';
    const key = fieldKey(capture);
    if (lastSent.get(key) === value) return;
    // Releitura de campo tocado que nunca teve valor: nada a gravar.
    if (skipUnseenEmpty && value === '' && !lastSent.has(key)) return;
    lastSent.set(key, value);
    const field: RecordedField = {
      capture: { ...capture },
      value,
      url: win.location.href,
      recordedAt: now(),
    };
    deps.send(field).then(
      (status) => {
        if (!bar) return;
        if (!status.active) return stopLocal();
        setCount(status.count);
        if (value.trim() !== '') bar.flash(`Gravado: ${capture.label ?? 'campo sem rótulo'}`);
      },
      () => {
        // Background indisponível: tenta de novo na próxima alteração.
        lastSent.delete(key);
      },
    );
  }

  function schedule(root: Element, target: Element, delay: number): void {
    const pending = timers.get(root);
    if (pending) clearTimeout(pending.timer);
    timers.set(root, { timer: setTimeout(() => report(root, target), delay), target });
  }

  function touch(root: Element): void {
    touched.delete(root);
    touched.add(root);
    for (const el of Array.from(touched)) if (!el.isConnected) touched.delete(el);
    while (touched.size > MAX_TOUCHED) {
      const oldest = touched.values().next().value;
      if (oldest === undefined) break;
      touched.delete(oldest);
    }
  }

  /** Relê os campos tocados e envia só os que mudaram (valor definido por script de um widget). */
  function rescan(): void {
    for (const root of Array.from(touched)) {
      if (!root.isConnected) {
        touched.delete(root);
        continue;
      }
      const pending = timers.get(root);
      if (pending) clearTimeout(pending.timer);
      report(root, pending?.target ?? root, true);
    }
  }

  function scheduleRescan(): void {
    for (const t of rescanTimers) clearTimeout(t);
    rescanTimers = RESCAN_MS.map((ms) => setTimeout(() => bar && !paused() && rescan(), ms));
  }

  function flush(): void {
    for (const [root, p] of Array.from(timers)) {
      clearTimeout(p.timer);
      report(root, p.target);
    }
    rescan();
  }

  function onEvent(ev: Event): void {
    if (!bar || paused() || !trusted(ev)) return;
    const target = ev.composedPath()[0];
    if (!isElement(target)) return;
    // keydown não muda valor nem fecha widgets: não vale nenhum trabalho.
    if (ev.type === 'keydown') return;
    const own = fromOwnUi(ev);
    if (ev.type === 'keyup') {
      // Só teclas que confirmam/fecham widgets; usa o que já se sabe do alvo, sem resolver.
      if (own || !isRescanKey(ev)) return;
      const cached = cachedHit(target);
      if (cached) touch(cached.root);
      scheduleRescan();
      return;
    }
    const hit = hitFor(target);
    if (hit && !own) touch(hit.root);
    // Clique fora de campo (Próximo, Salvar, Parar...): a página pode navegar já, então
    // reporta antes de qualquer outra coisa o que ainda está no debounce.
    if (ev.type === 'click' && !hit) {
      flush();
      if (!own) scheduleRescan();
      return;
    }
    if (own) return;
    if (RESCAN_EVENTS.includes(ev.type)) scheduleRescan();
    if (!hit) return;
    if (ev.type === 'focusin') return;
    if (ev.type === 'change' || ev.type === 'focusout') {
      // Valor final já está no campo: reporta na hora (cancela o debounce pendente).
      const pending = timers.get(hit.root);
      if (pending) clearTimeout(pending.timer);
      report(hit.root, target);
      return;
    }
    schedule(hit.root, target, ev.type === 'input' ? INPUT_DEBOUNCE_MS : CLICK_DEBOUNCE_MS);
  }

  function onLeave(): void {
    if (bar && !paused()) flush();
  }

  function stopLocal(): void {
    if (!bar) return;
    for (const type of EVENTS) win.removeEventListener(type, onEvent, true);
    for (const type of LEAVE_EVENTS) win.removeEventListener(type, onLeave, true);
    for (const p of timers.values()) clearTimeout(p.timer);
    timers.clear();
    for (const t of rescanTimers) clearTimeout(t);
    rescanTimers = [];
    touched.clear();
    known.clear();
    lastSent.clear();
    bar.destroy();
    bar = null;
    count = 0;
  }

  function start(status: RecorderStatus): void {
    if (!bar) {
      bar = createRecorderBar(doc, {
        onStop: () => deps.onStop(false),
        onDiscard: () => deps.onStop(true),
      });
      for (const type of EVENTS) {
        win.addEventListener(type, onEvent, { capture: true, passive: true });
      }
      for (const type of LEAVE_EVENTS) {
        win.addEventListener(type, onLeave, { capture: true, passive: true });
      }
    }
    setCount(status.count);
  }

  return {
    get active() {
      return bar !== null;
    },
    start,
    flush,
    update(status) {
      if (!status.active) return stopLocal();
      if (!bar) return start(status);
      if (status.count !== count) setCount(status.count);
    },
    stop: stopLocal,
  };
}
