import type { Message, MessageResponse } from '../../../shared/messages';
import { withTimeout } from './timeout';

/**
 * Descobre a aba alvo. `?tabId=<n>` na URL do popup existe SOMENTE para testes E2E
 * (o popup é aberto como página comum, sem "aba ativa" útil); em uso normal vale a aba ativa.
 */
export async function resolveTabId(search: string = location.search): Promise<number | null> {
  const q = new URLSearchParams(search).get('tabId');
  if (q !== null && /^\d+$/.test(q)) return Number(q);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

export const STATUS_TIMEOUT_MS = 1500;

export async function sendToTab<M extends Message['type']>(
  tabId: number,
  message: Extract<Message, { type: M }>,
  timeoutMs = STATUS_TIMEOUT_MS,
  frameId?: number,
): Promise<MessageResponse<M>> {
  return withTimeout(
    (frameId === undefined
      ? browser.tabs.sendMessage(tabId, message)
      : browser.tabs.sendMessage(tabId, message, { frameId })) as Promise<MessageResponse<M>>,
    timeoutMs,
  );
}

/** Mensagem a um frame específico da aba (0 = topo). */
export function sendToFrame<M extends Message['type']>(
  tabId: number,
  frameId: number,
  message: Extract<Message, { type: M }>,
  timeoutMs = STATUS_TIMEOUT_MS,
): Promise<MessageResponse<M>> {
  return sendToTab(tabId, message, timeoutMs, frameId);
}

/** Estado agregado dos frames, respondido pelo background. */
export function askFrames(tabId: number): Promise<MessageResponse<'tab/frames'>> {
  return withTimeout(
    browser.runtime.sendMessage({
      type: 'tab/frames',
      payload: { tabId },
    }) as Promise<MessageResponse<'tab/frames'>>,
    STATUS_TIMEOUT_MS,
  );
}
