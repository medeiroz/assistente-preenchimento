import { ref } from 'vue';
import { recorderStatus, startRecording } from '../lib/recorder';
import { STATUS_TIMEOUT_MS } from '../lib/tab';
import { withTimeout } from '../lib/timeout';
import type { TabContext } from './useTabContext';
import { t } from '../../../core/i18n';

/** Gravação do preenchimento: estado, início e parada. */
export function useRecording({ tab, busy, error }: TabContext) {
  const starting = ref(false);
  const awaitingPermission = ref(false);
  const recording = ref({ active: false, count: 0 });

  async function loadRecording(id: number): Promise<void> {
    try {
      tab.url = (await withTimeout(browser.tabs.get(id), STATUS_TIMEOUT_MS)).url;
    } catch {
      tab.url = undefined;
    }
    recording.value = await recorderStatus(id, (t) =>
      withTimeout(
        browser.runtime.sendMessage({ type: 'recorder/status', payload: { tabId: t } }) as Promise<{
          active: boolean;
          count: number;
        }>,
        STATUS_TIMEOUT_MS,
      ),
    );
  }

  /** Liga a gravação (também em sites sem permissão) e fecha o popup para o usuário preencher. */
  function recordStart(): void {
    if (tab.id === null || busy.value) return;
    const id = tab.id;
    busy.value = true;
    starting.value = true;
    error.value = '';
    // Chamado direto do clique: permissão e `recorder/start` saem juntos, antes de qualquer await.
    // O popup só fecha quando as duas terminam: fechar antes cancelaria o pedido de permissão.
    startRecording(id, tab.url, {
      requestPermission: (origin) => {
        awaitingPermission.value = true;
        return browser.permissions.request({ origins: [origin] }).finally(() => {
          awaitingPermission.value = false;
        });
      },
      sendStart: (t) =>
        browser.runtime.sendMessage({ type: 'recorder/start', payload: { tabId: t } }),
    })
      .then(() => window.close())
      .catch((e: unknown) => {
        error.value = e instanceof Error ? e.message : t('popStartFailed');
      })
      .finally(() => {
        busy.value = false;
        starting.value = false;
        awaitingPermission.value = false;
      });
  }

  async function recordStop(discard: boolean): Promise<void> {
    if (tab.id === null || busy.value) return;
    const tabId = tab.id;
    busy.value = true;
    error.value = '';
    try {
      await browser.runtime.sendMessage({
        type: 'recorder/stop',
        payload: discard ? { tabId, discard: true } : { tabId },
      });
      if (discard) recording.value = { active: false, count: 0 };
      window.close();
    } catch {
      error.value = t('popStopFailed');
    } finally {
      busy.value = false;
    }
  }

  return { starting, awaitingPermission, recording, loadRecording, recordStart, recordStop };
}
