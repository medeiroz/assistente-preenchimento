import type { RunReport } from '../../core/model';
import type { Message, TabStatus, UiAction, UiButton, UiToast } from '../../shared/messages';

/** A UI que o controller usa (a de `createPageUi`). */
export interface PageUi {
  showReport(r: RunReport, actions?: { undo?: () => void }): void;
  highlight(roots: Element[]): void;
  showActionButton(id: string, label: string, onClick: () => void): void;
  hideActionButton(id: string): void;
}

type Send = (message: Message) => Promise<unknown>;

const noop = (): void => undefined;

export interface RelayedUi {
  ui: PageUi;
  /** Clique no topo (botão ou "Desfazer") que voltou para este frame. */
  handleAction(action: UiAction): void;
}

/**
 * UI de um frame filho: toast e botões vão para o frame de topo (via background) quando ele tem
 * motor registrado; do contrário (resposta `false` ou erro) aparecem no próprio frame. O destaque
 * do campo fica sempre aqui.
 */
export function createRelayedUi(local: PageUi, send: Send): RelayedUi {
  const handlers = new Map<string, () => void>();
  let undoCb: (() => void) | undefined;

  return {
    ui: {
      highlight: (roots) => local.highlight(roots),
      showReport(r, actions) {
        undoCb = actions?.undo;
        const payload: UiToast = { report: r, canUndo: actions?.undo !== undefined };
        send({ type: 'ui/toast', payload }).then(
          (ok) => {
            if (ok !== true) local.showReport(r, actions);
          },
          () => local.showReport(r, actions),
        );
      },
      showActionButton(id, label, onClick) {
        handlers.set(id, onClick);
        const payload: UiButton = { id, label, shown: true };
        const fallback = (): void => {
          if (handlers.get(id) === onClick) local.showActionButton(id, label, onClick);
        };
        send({ type: 'ui/button', payload }).then((ok) => {
          if (ok !== true) fallback();
        }, fallback);
      },
      hideActionButton(id) {
        handlers.delete(id);
        local.hideActionButton(id);
        send({ type: 'ui/button', payload: { id, label: '', shown: false } }).catch(noop);
      },
    },
    handleAction(action) {
      if (action.kind === 'undo') undoCb?.();
      else if (action.id !== undefined) handlers.get(action.id)?.();
    },
  };
}

export interface TopRelay {
  /** Devolve true se a mensagem era do relay. */
  handle(message: Message): boolean;
}

/** Frame de topo: mostra no `ui` real o que os frames filhos mandaram e devolve os cliques. */
export function createTopRelay(ui: PageUi, sendAction: (action: UiAction) => void): TopRelay {
  const keyOf = (frameId: number, id: string): string => `frame${frameId}:${id}`;
  const shown = new Set<string>();
  return {
    handle(message) {
      switch (message.type) {
        case 'ui/toast': {
          const { report, canUndo, frameId } = message.payload;
          if (frameId === undefined) return true;
          ui.showReport(
            report,
            canUndo ? { undo: () => sendAction({ frameId, kind: 'undo' }) } : undefined,
          );
          return true;
        }
        case 'ui/button': {
          const { frameId, id, label, shown: on } = message.payload;
          if (frameId === undefined) return true;
          const key = keyOf(frameId, id);
          if (on) {
            shown.add(key);
            ui.showActionButton(key, label, () => sendAction({ frameId, kind: 'button', id }));
          } else {
            shown.delete(key);
            ui.hideActionButton(key);
          }
          return true;
        }
        case 'ui/frame-gone': {
          const prefix = `frame${message.payload.frameId}:`;
          for (const key of [...shown]) {
            if (!key.startsWith(prefix)) continue;
            shown.delete(key);
            ui.hideActionButton(key);
          }
          return true;
        }
        default:
          return false;
      }
    },
  };
}

export interface HelloPayload {
  url: string;
  topUrl?: string;
  activeRules: TabStatus['activeRules'];
  lastReport: RunReport | null;
}

export interface FrameReporter {
  /** Agenda um `frame/hello` com o estado atual (só envia se algo mudou). */
  notify(): void;
  /** Envia já, mesmo sem mudança, e devolve a resposta do background. */
  hello(): Promise<{ topUrl?: string } | undefined>;
  bye(): void;
}

export interface FrameReporterDeps {
  send: Send;
  snapshot(): HelloPayload;
  delayMs?: number;
}

/** Avisa o background do estado do motor deste frame (`frame/hello` e `frame/bye`). */
export function createFrameReporter(deps: FrameReporterDeps): FrameReporter {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSent = '';

  function post(): Promise<{ topUrl?: string } | undefined> {
    const payload = deps.snapshot();
    lastSent = JSON.stringify(payload);
    return deps.send({ type: 'frame/hello', payload }).then(
      (r) => (typeof r === 'object' && r !== null ? (r as { topUrl?: string }) : undefined),
      () => undefined,
    );
  }

  return {
    notify() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (JSON.stringify(deps.snapshot()) !== lastSent) void post();
      }, deps.delayMs ?? 0);
    },
    hello: post,
    bye() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      deps.send({ type: 'frame/bye', payload: {} }).catch(noop);
    },
  };
}
