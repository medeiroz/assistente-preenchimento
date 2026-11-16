import { parseRule, type Rule } from '../core/model';
import { createFramesBackground, createFrameRegistry } from '../core/frames';
import { createRecorderBackground } from '../core/recorder';
import { chromeSyncRepository, seedIfEmpty } from '../core/storage';
import { initI18n } from '../shared/i18n';
import { isMessage } from '../shared/messages';
import { contentScriptFile } from '../shared/content-script';
import {
  createMenuController,
  handleMenuClick,
  type ClickDeps,
  type ClickInfo,
  type ClickTab,
  type MenuItem,
} from '../shared/context-menu';
import { syncDynamicScripts, watchSyncTriggers, type DynamicSyncDeps } from '../shared/permissions';

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

function warnFrames(e: unknown): void {
  console.warn('[assistente] falha no registro de frames', e);
}

function warnRecorder(e: unknown): void {
  console.warn('[assistente] falha na gravação', e);
}

type ChromeMenuItem = Parameters<typeof browser.contextMenus.create>[0];

function menuApi() {
  return {
    removeAll: (): Promise<void> => browser.contextMenus.removeAll(),
    create: (item: MenuItem): Promise<void> =>
      new Promise((resolve, reject) => {
        browser.contextMenus.create(item as ChromeMenuItem, () => {
          const err = browser.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        });
      }),
  };
}

export default defineBackground(() => {
  initI18n();
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
  const registry = createFrameRegistry({
    session: browser.storage.session,
    tabUrl: async (tabId) => (await browser.tabs.get(tabId)).url,
  });
  const frames = createFramesBackground({
    registry,
    sendToFrame: (tabId, frameId, message) => browser.tabs.sendMessage(tabId, message, { frameId }),
    broadcast: (tabId, message) => browser.tabs.sendMessage(tabId, message),
    pausedHosts: async () => (await chromeSyncRepository().load()).settings.pausedHosts,
  });
  // Menu de contexto: itens estáticos + dinâmicos (regras da aba ativa, pausar/retomar).
  const menu = createMenuController({
    menus: menuApi(),
    activeTab: async () => {
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id === undefined) return null;
      const paused = (await chromeSyncRepository().load()).settings.pausedHosts;
      return { tabId: tab.id, aggregate: await registry.aggregate(tab.id, paused) };
    },
    onError: (e) => console.warn('[assistente] falha no menu de contexto', e),
  });
  const clickDeps: ClickDeps = {
    sendToFrame: (tabId, frameId, message) => browser.tabs.sendMessage(tabId, message, { frameId }),
    injectFrame: (tabId, frameId) =>
      browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: [contentScriptFile(browser.runtime.getManifest()) as never],
      }),
    frames: (tabId) => registry.frames(tabId),
    loadSettings: async () => (await chromeSyncRepository().load()).settings,
    saveSettings: (settings) => chromeSyncRepository().saveSettings(settings),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  const onMenuClick = (info: ClickInfo, tab: ClickTab | undefined): Promise<void> =>
    handleMenuClick(info, tab, clickDeps);
  if (E2E) {
    // Só no build de testes: o menu nativo não é automatizável; o teste chama o handler direto.
    (globalThis as { __assistenteMenu?: unknown }).__assistenteMenu = { click: onMenuClick };
  }
  browser.contextMenus.onClicked.addListener((info, tab) => {
    onMenuClick(info, tab).catch((e: unknown) =>
      console.warn('[assistente] falha no menu de contexto', e),
    );
  });
  browser.tabs.onActivated.addListener(() => menu.schedule());
  browser.windows.onFocusChanged.addListener(() => menu.schedule());
  browser.runtime.onInstalled.addListener(() => void menu.init());
  void menu.init();
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    recorder.tabUpdated(tabId, changeInfo.status).catch(warnRecorder);
    frames.tabUpdated(tabId, changeInfo).catch(warnFrames);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    recorder.tabRemoved(tabId).catch(warnRecorder);
    frames.tabRemoved(tabId).catch(warnFrames);
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isMessage(message)) return false;
    const senderTab = sender.tab?.id;
    const framesJob = frames.handle(message, {
      ...(senderTab !== undefined ? { tabId: senderTab } : {}),
      ...(sender.frameId !== undefined ? { frameId: sender.frameId } : {}),
      ...(sender.tab?.url ? { tabUrl: sender.tab.url } : {}),
    });
    if (framesJob) {
      if (message.type === 'frame/hello' || message.type === 'frame/bye') {
        framesJob.then(() => menu.scheduleForTab(senderTab), warnFrames);
      }
      framesJob.then(sendResponse, (e: unknown) => {
        warnFrames(e);
        sendResponse(undefined);
      });
      return true;
    }
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
  chromeSyncRepository().onChange(() => menu.schedule()); // pausa mudou
  watchSyncTriggers(browser, scheduleSync);
  run();
});
