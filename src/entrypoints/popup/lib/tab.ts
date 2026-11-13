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
): Promise<MessageResponse<M>> {
  return withTimeout(
    browser.tabs.sendMessage(tabId, message) as Promise<MessageResponse<M>>,
    timeoutMs,
  );
}
