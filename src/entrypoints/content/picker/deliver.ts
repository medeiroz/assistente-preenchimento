import { PICKER_DRAFT_KEY, type Capture, type PickerDraft } from '../../../core/locator';
import type { Message } from '../../../shared/messages';

export interface DeliverDeps {
  storage: { set(items: Record<string, unknown>): Promise<void> };
  sendMessage(message: Message): Promise<unknown>;
  now?(): number;
}

/**
 * Grava a captura em `storage.local` ('picker:draft') e pede ao background para abrir (ou
 * focar) a página de opções, que consome o rascunho. A gravação vem ANTES da mensagem para
 * a página nunca abrir sem o rascunho.
 */
export async function deliverCapture(capture: Capture, deps: DeliverDeps): Promise<void> {
  const draft: PickerDraft = { capture, createdAt: (deps.now ?? Date.now)() };
  await deps.storage.set({ [PICKER_DRAFT_KEY]: draft });
  await deps.sendMessage({ type: 'options/open-draft' });
}
