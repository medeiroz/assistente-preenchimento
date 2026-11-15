import { frameUrlOf } from '../../../core/engine';
import { buildCapture, resolveField, type Capture } from '../../../core/locator';
import { createOverlay, type Overlay } from './overlay';

export { PICKER_HOST_ATTR } from './overlay';
export { deliverCapture } from './deliver';
export type { DeliverDeps } from './deliver';

/** Eventos do mouse que o site NÃO pode ver enquanto o modo captura está ligado. */
const POINTER_EVENTS = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'] as const;

/** Depois de um Escape que cancela, o `keyup` correspondente ainda precisa ser engolido. */
const ESCAPE_RELEASE_GUARD_MS = 1500;

const TYPE_LABEL: Record<string, string> = {
  'native-text': 'Texto',
  'native-select': 'Lista',
  'native-choice': 'Escolha',
  'vue-multiselect': 'Lista com busca',
  date: 'Data',
  contenteditable: 'Texto editável',
  'react-select': 'Lista com busca',
  select2: 'Lista com busca',
  auto: 'Campo',
};

export interface PickerDeps {
  win?: Window;
  /**
   * Só reage a eventos de um usuário de verdade (`isTrusted`). Eventos sintéticos, como os que o
   * próprio motor de preenchimento dispara nos campos, passam direto: não são capturados nem
   * engolidos. Sem isso, um preenchimento em andamento "clicaria" sozinho e encerraria a captura.
   */
  trustedOnly?: boolean;
  /** Sem a faixa de instruções (iframes): só o destaque do campo. */
  compact?: boolean;
  /** Chamado uma vez, depois que o modo captura já foi encerrado. */
  onCapture(capture: Capture): void;
  onCancel?(): void;
}

export interface Picker {
  start(): void;
  stop(): void;
  readonly active: boolean;
}

function isElement(x: EventTarget | null): x is Element {
  return x !== null && (x as Node).nodeType === 1;
}

/** Alvo real do evento: dentro de shadow roots abertos `ev.target` é só o host (retargeting). */
function realTarget(ev: Event): Element | null {
  const first = ev.composedPath()[0] ?? ev.target;
  return isElement(first) ? first : null;
}

function isEscape(ev: Event): boolean {
  return (ev as Partial<KeyboardEvent>).key === 'Escape';
}

function swallow(ev: Event): void {
  ev.preventDefault();
  ev.stopImmediatePropagation();
}

/**
 * Modo captura: faixa no topo + destaque da raiz do campo sob o cursor. Todos os listeners
 * ficam no `window`, em fase de captura, para o site não reagir ao clique nem ao Escape.
 * Nunca dispara eventos sintéticos.
 */
export function createPicker(deps: PickerDeps): Picker {
  const win = deps.win ?? window;
  const doc = win.document;
  const ignored = (ev: Event): boolean => deps.trustedOnly === true && !ev.isTrusted;
  let overlay: Overlay | null = null;
  let hovered: Element | null = null;
  let raf = 0;
  let pendingTarget: Element | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  function schedule(fn: () => void): void {
    if (raf) win.cancelAnimationFrame(raf);
    raf = win.requestAnimationFrame(() => {
      raf = 0;
      fn();
    });
  }

  function paint(): void {
    if (!overlay) return;
    const target = pendingTarget;
    hovered = null;
    if (!target) return overlay.highlight(null, '');
    const hit = resolveField(target);
    if (!hit) return overlay.highlight(null, '');
    hovered = hit.root;
    overlay.highlight(
      hit.root.getBoundingClientRect(),
      `${hit.label ?? 'Campo sem rótulo'} · ${TYPE_LABEL[hit.adapter] ?? 'Campo'}`,
    );
  }

  function reposition(): void {
    if (!overlay) return;
    if (hovered && hovered.isConnected) schedule(paint);
  }

  function onMove(ev: Event): void {
    if (!overlay || ignored(ev) || overlay.owns(ev)) return;
    pendingTarget = realTarget(ev);
    schedule(paint);
  }

  function onPointer(ev: Event): void {
    if (!overlay || ignored(ev) || overlay.owns(ev)) return;
    swallow(ev);
    const target = realTarget(ev);
    if (ev.type !== 'click' || !target) return;
    const capture = buildCapture(target, doc, frameUrlOf(win));
    if (!capture) {
      overlay.notify('Isso não parece ser um campo. Tente outro.');
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => overlay?.notify(null), 3000);
      return;
    }
    stop();
    deps.onCapture(capture);
  }

  function onKey(ev: Event): void {
    if (!isEscape(ev) || ignored(ev)) return;
    // Escape do usuário: o site (ex.: modal da CE) nunca pode vê-lo.
    swallow(ev);
    if (ev.type !== 'keydown') return;
    stop();
    guardEscapeRelease();
    deps.onCancel?.();
  }

  /** Engole o `keyup` do Escape que cancelou (o `keydown` já saiu do modo captura). */
  function guardEscapeRelease(): void {
    const timer = setTimeout(done, ESCAPE_RELEASE_GUARD_MS);
    function onUp(ev: Event): void {
      if (isEscape(ev) && !ignored(ev)) {
        swallow(ev);
        done();
      }
    }
    function done(): void {
      clearTimeout(timer);
      win.removeEventListener('keyup', onUp, true);
    }
    win.addEventListener('keyup', onUp, true);
  }

  function stop(): void {
    if (!overlay) return;
    for (const type of POINTER_EVENTS) win.removeEventListener(type, onPointer, true);
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('keyup', onKey, true);
    win.removeEventListener('keypress', onKey, true);
    win.removeEventListener('mousemove', onMove, true);
    win.removeEventListener('scroll', reposition, true);
    win.removeEventListener('resize', reposition, true);
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(noteTimer);
    overlay.destroy();
    overlay = null;
    hovered = null;
    pendingTarget = null;
  }

  function cancel(): void {
    if (!overlay) return;
    stop();
    deps.onCancel?.();
  }

  return {
    get active() {
      return overlay !== null;
    },
    start() {
      if (overlay) return;
      overlay = createOverlay(doc, cancel, deps.compact === true);
      for (const type of POINTER_EVENTS) win.addEventListener(type, onPointer, true);
      win.addEventListener('keydown', onKey, true);
      win.addEventListener('keyup', onKey, true);
      win.addEventListener('keypress', onKey, true);
      win.addEventListener('mousemove', onMove, { capture: true, passive: true });
      win.addEventListener('scroll', reposition, { capture: true, passive: true });
      win.addEventListener('resize', reposition, { capture: true, passive: true });
    },
    stop,
  };
}
