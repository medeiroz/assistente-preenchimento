import type { Message } from '../../shared/messages';
import type { FrameRegistry } from './registry';

export interface FramesBackgroundDeps {
  registry: FrameRegistry;
  /** `tabs.sendMessage(tabId, message, { frameId })`. */
  sendToFrame(tabId: number, frameId: number, message: Message): Promise<unknown>;
  /** `tabs.sendMessage(tabId, message)`: todos os frames da aba. */
  broadcast(tabId: number, message: Message): Promise<unknown>;
  pausedHosts(): Promise<string[]>;
}

export interface MessageSender {
  tabId?: number;
  frameId?: number;
  tabUrl?: string;
}

/**
 * Parte do background que cuida dos frames: registro, estado agregado do popup e relay da UI
 * (frame filho -> frame de topo -> frame filho). `handle` devolve null para mensagens que não são
 * dos frames; do contrário, a promessa da resposta.
 */
export function createFramesBackground(deps: FramesBackgroundDeps) {
  const { registry } = deps;
  const ignore = (): void => undefined;

  /** O frame filho `sender` pode usar a UI do topo? Só se o topo tem motor registrado. */
  async function relayTarget(s: MessageSender): Promise<number | null> {
    if (s.tabId === undefined || s.frameId === undefined || s.frameId === 0) return null;
    return (await registry.has(s.tabId, 0)) ? s.tabId : null;
  }

  return {
    handle(message: Message, s: MessageSender): Promise<unknown> | null {
      switch (message.type) {
        case 'frame/hello': {
          const { tabId, frameId } = s;
          if (tabId === undefined || frameId === undefined) return Promise.resolve(undefined);
          const topUrl = message.payload.topUrl ?? s.tabUrl;
          return registry
            .hello(tabId, frameId, { ...message.payload, ...(topUrl ? { topUrl } : {}) })
            .then(() => ({ ...(s.tabUrl ? { topUrl: s.tabUrl } : {}) }));
        }
        case 'frame/bye': {
          const { tabId, frameId } = s;
          if (tabId === undefined || frameId === undefined) return Promise.resolve(undefined);
          return registry.bye(tabId, frameId).then(async () => {
            if (frameId !== 0) {
              await deps
                .sendToFrame(tabId, 0, { type: 'ui/frame-gone', payload: { frameId } })
                .catch(ignore);
            }
          });
        }
        case 'tab/frames':
          return deps
            .pausedHosts()
            .then((paused) => registry.aggregate(message.payload.tabId, paused));
        case 'ui/toast': {
          return relayTarget(s).then(async (tabId) => {
            if (tabId === null) return false;
            return deps
              .sendToFrame(tabId, 0, {
                type: 'ui/toast',
                payload: { ...message.payload, frameId: s.frameId },
              })
              .then(
                () => true,
                () => false,
              );
          });
        }
        case 'ui/button': {
          return relayTarget(s).then(async (tabId) => {
            if (tabId === null) return false;
            return deps
              .sendToFrame(tabId, 0, {
                type: 'ui/button',
                payload: { ...message.payload, frameId: s.frameId },
              })
              .then(
                () => true,
                () => false,
              );
          });
        }
        case 'ui/action': {
          // Só o frame de topo origina cliques relayados.
          if (s.tabId === undefined || s.frameId !== 0) return Promise.resolve(undefined);
          return deps.sendToFrame(s.tabId, message.payload.frameId, message).then(ignore, ignore);
        }
        case 'picker/stop': {
          if (s.tabId === undefined) return Promise.resolve(undefined);
          return deps.broadcast(s.tabId, { type: 'picker/stop' }).then(ignore, ignore);
        }
        default:
          return null;
      }
    },
    tabRemoved: (tabId: number): Promise<void> => registry.tabRemoved(tabId),
    tabUpdated: (tabId: number, change: { status?: string; url?: string }): Promise<void> =>
      registry.tabUpdated(tabId, change),
  };
}

export type FramesBackground = ReturnType<typeof createFramesBackground>;
