export interface InjectDeps {
  /** `chrome.scripting.executeScript` com `files`; o `activeTab` do clique no ícone autoriza. */
  executeScript(injection: {
    target: { tabId: number };
    files: [string, ...string[]];
  }): Promise<unknown>;
  /** Envia 'picker/start' à aba; rejeita enquanto o content script ainda não está ouvindo. */
  startPicker(tabId: number): Promise<unknown>;
  sleep(ms: number): Promise<void>;
  scriptFile: string;
}

export const START_ATTEMPTS = 8;
export const START_DELAY_MS = 150;

/**
 * Injeta o content script na aba (site sem regra/permissão) e liga o modo "Capturar campo".
 * Injetar duas vezes é seguro: o content script tem guarda contra motor duplicado. O script
 * registra o ouvinte de mensagens depois de ler a configuração, por isso o envio tenta de novo.
 */
export async function injectAndStartPicker(tabId: number, deps: InjectDeps): Promise<void> {
  await deps.executeScript({ target: { tabId }, files: [deps.scriptFile] });
  let last: unknown;
  for (let i = 0; i < START_ATTEMPTS; i++) {
    try {
      await deps.startPicker(tabId);
      return;
    } catch (e) {
      last = e;
      await deps.sleep(START_DELAY_MS);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
