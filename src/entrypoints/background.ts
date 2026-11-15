import { parseRule, type Rule } from '../core/model';
import { createRecorderBackground } from '../core/recorder';
import { chromeSyncRepository, seedIfEmpty } from '../core/storage';
import { isMessage } from '../shared/messages';
import { contentScriptFile } from '../shared/content-script';
import { syncDynamicScripts, type DynamicSyncDeps } from '../shared/permissions';

const E2E = import.meta.env.MODE === 'e2e';

function parsePresets(raw: unknown[]): Rule[] {
  const rules: Rule[] = [];
  for (const item of raw) {
    const r = parseRule(item);
    if (r.ok) rules.push(r.rule);
    else console.warn('[assistente] preset inválido descartado:', r.errors.join('; '));
  }
  return rules;
}

/**
 * Produção: nenhuma regra pré-instalada (a extensão é genérica), mas a instalação é marcada.
 * Build e2e: semeia as regras de teste (dynamic import: some do bundle de produção).
 */
async function seed(): Promise<void> {
  const raw: unknown[] = [];
  if (E2E) {
    raw.push((await import('../../presets/ce-nfse.json')).default);
    raw.push((await import('../../presets/e2e-harness.json')).default);
  }
  await seedIfEmpty(chromeSyncRepository(), parsePresets(raw));
}

// Uma única semeadura em andamento: onInstalled e a partida do worker chamam `run` quase juntos,
// e duas gravações simultâneas disparam recargas duplicadas nas páginas abertas.
let seeding: Promise<void> | undefined;
function seedOnce(): Promise<void> {
  seeding ??= seed();
  return seeding;
}

function dynamicDeps(): DynamicSyncDeps {
  const repo = chromeSyncRepository();
  return {
    api: browser,
    loadRules: async () => (await repo.load()).rules,
    scriptFile: contentScriptFile(browser.runtime.getManifest()),
  };
}

// Serializa as sincronizações: register concorrente falharia com "id duplicado".
let syncChain: Promise<unknown> = Promise.resolve();
function scheduleSync(): void {
  syncChain = syncChain.then(() => syncDynamicScripts(dynamicDeps()));
}

function warnRecorder(e: unknown): void {
  console.warn('[assistente] falha na gravação', e);
}

export default defineBackground(() => {
  console.info('[assistente] service worker iniciado');
  const run = (): void => {
    seedOnce()
      .catch((e: unknown) => console.warn('[assistente] falha ao semear presets', e))
      .finally(scheduleSync);
  };
  browser.runtime.onInstalled.addListener((d) => {
    if (d.reason === 'install') run();
  });
  const recorder = createRecorderBackground({
    session: browser.storage.session,
    local: browser.storage.local,
    sendState: (tabId, status) =>
      browser.tabs.sendMessage(tabId, { type: 'recorder/state', payload: status }),
    openOptions: () => browser.runtime.openOptionsPage(),
    inject: (tabId) =>
      browser.scripting.executeScript({
        target: { tabId },
        files: [contentScriptFile(browser.runtime.getManifest()) as never],
      }),
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    recorder.tabUpdated(tabId, changeInfo.status).catch(warnRecorder);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    recorder.tabRemoved(tabId).catch(warnRecorder);
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isMessage(message)) return false;
    const senderTab = sender.tab?.id;
    let job: Promise<unknown> | null = null;
    switch (message.type) {
      // A captura (content script) já gravou 'picker:draft'; aqui só abrimos/focamos as opções.
      case 'options/open-draft':
        browser.runtime
          .openOptionsPage()
          .catch((e: unknown) => console.warn('[assistente] falha ao abrir as opções', e));
        return false;
      case 'recorder/start':
        job = recorder.start(message.payload.tabId);
        break;
      case 'recorder/status':
        job = recorder.status(message.payload.tabId ?? senderTab);
        break;
      case 'recorder/field':
        job = recorder.field(senderTab, message.payload.field);
        break;
      case 'recorder/stop':
        job = recorder.stop(message.payload.tabId, senderTab, message.payload.discard);
        break;
      default:
        return false;
    }
    job.then(sendResponse, (e: unknown) => {
      warnRecorder(e);
      sendResponse({ active: false, count: 0 });
    });
    return true;
  });
  chromeSyncRepository().onChange(scheduleSync);
  browser.permissions.onAdded.addListener(scheduleSync);
  browser.permissions.onRemoved.addListener(scheduleSync);
  run();
});
