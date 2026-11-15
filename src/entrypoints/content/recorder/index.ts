import { buildCapture, resolveField } from '../../../core/locator';
import type { RecordedField, RecorderStatus } from '../../../core/recorder/types';
import { fieldKey } from '../../../core/recorder/session';
import { ACTION_HOST_ATTR, TOAST_HOST_ATTR } from '../page-ui';
import { PICKER_HOST_ATTR } from '../picker';
import { createRecorderBar, RECORDER_HOST_ATTR, type RecorderBar } from './bar';

export { RECORDER_HOST_ATTR } from './bar';

const EVENTS = ['input', 'change', 'click', 'focusout'] as const;
const INPUT_DEBOUNCE_MS = 300;
const OTHER_DEBOUNCE_MS = 150;

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
}

export interface Recorder {
  start(status: RecorderStatus): void;
  update(status: RecorderStatus): void;
  stop(): void;
  readonly active: boolean;
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
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const lastSent = new Map<string, string>();

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

  function report(root: Element, target: Element): void {
    timers.delete(root);
    if (!bar) return;
    const el = root.isConnected ? root : target;
    if (!el.isConnected) return;
    if (isSensitive(root, target)) return;
    const capture = buildCapture(el, doc, win.location.href);
    if (!capture) return;
    const value = capture.currentValue ?? '';
    const key = fieldKey(capture);
    if (lastSent.get(key) === value) return;
    lastSent.set(key, value);
    const field: RecordedField = { capture, value, url: win.location.href, recordedAt: now() };
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

  function onEvent(ev: Event): void {
    if (!bar || !trusted(ev) || fromOwnUi(ev)) return;
    const target = ev.composedPath()[0];
    if (!isElement(target)) return;
    const hit = resolveField(target);
    if (!hit) return;
    const pending = timers.get(hit.root);
    if (pending) clearTimeout(pending);
    const delay = ev.type === 'input' ? INPUT_DEBOUNCE_MS : OTHER_DEBOUNCE_MS;
    timers.set(
      hit.root,
      setTimeout(() => report(hit.root, target), delay),
    );
  }

  function stopLocal(): void {
    if (!bar) return;
    for (const type of EVENTS) win.removeEventListener(type, onEvent, true);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
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
    }
    setCount(status.count);
  }

  return {
    get active() {
      return bar !== null;
    },
    start,
    update(status) {
      if (!status.active) return stopLocal();
      if (!bar) return start(status);
      if (status.count !== count) setCount(status.count);
    },
    stop: stopLocal,
  };
}
