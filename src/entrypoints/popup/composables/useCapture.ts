import type { ScriptPublicPath } from 'wxt/utils/inject-script';
import { contentScriptFile } from '../../../shared/content-script';
import { injectAndStartPicker } from '../lib/inject';
import { sendToTab } from '../lib/tab';
import type { TabContext } from './useTabContext';

/** Captura de campo: com content script já presente ou injetando sob demanda. */
export function useCapture({ tab, busy, error }: TabContext) {
  async function startCapture(): Promise<void> {
    if (tab.id === null || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      await sendToTab(tab.id, { type: 'picker/start' });
      window.close(); // o popup fecha para o usuário clicar no campo da página
    } catch {
      error.value = 'A página não respondeu. Tente novamente.';
    } finally {
      busy.value = false;
    }
  }

  /** Site sem content script: injeta sob demanda (activeTab) e liga a captura. */
  async function captureOnDemand(): Promise<void> {
    if (tab.id === null || busy.value) return;
    const id = tab.id;
    busy.value = true;
    error.value = '';
    try {
      await injectAndStartPicker(id, {
        executeScript: (injection) =>
          browser.scripting.executeScript({
            target: injection.target,
            files: injection.files as ScriptPublicPath[],
          }),
        startPicker: (t) => sendToTab(t, { type: 'picker/start' }),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        scriptFile: contentScriptFile(browser.runtime.getManifest()),
      });
      window.close();
    } catch {
      error.value =
        'Não foi possível capturar nesta página. Páginas internas do Chrome e a Chrome Web Store não permitem extensões.';
    } finally {
      busy.value = false;
    }
  }

  return { startCapture, captureOnDemand };
}
