import type { Settings } from '../core/model';
import type { FrameEntry } from '../core/frames';
import type { Message, TabStatusAggregate } from './messages';
import { togglePausedHost } from './pause';
import { t } from '../core/i18n';

/**
 * Menu de contexto (botão direito). Os menus do Chrome são GLOBAIS: não há estado por aba. O
 * background reconstrói os itens dinâmicos (regras da aba ativa, pausar/retomar) ao trocar de aba
 * ou de janela, quando um frame se registra/sai e quando a configuração muda. Por isso pode haver
 * um instante de menu desatualizado (ex.: logo depois de abrir o menu numa aba recém-carregada);
 * o clique sempre confere o estado real do registro de frames.
 */

export const MENU_CAPTURE = 'ctx:capture';
export const MENU_FILL = 'ctx:fill';
export const MENU_FILL_NONE = 'ctx:fill-none';
export const MENU_FILL_RULE_PREFIX = 'ctx:fill-rule:';
export const MENU_PAUSE = 'ctx:pause';
export const MENU_RESUME = 'ctx:resume';

export type MenuContext = 'page' | 'editable' | 'frame';

export interface MenuItem {
  id: string;
  title: string;
  contexts: MenuContext[];
  parentId?: string;
  enabled?: boolean;
}

const FILL_CONTEXTS: MenuContext[] = ['page', 'editable', 'frame'];

/** `%` é o marcador de substituição dos títulos de menu do Chrome. */
function titleSafe(s: string): string {
  return s.replace(/%/g, '%%');
}

/** Itens do menu a partir do estado agregado da aba ativa (`null`: sem registro/sem aba). */
export function buildMenuItems(tab: TabStatusAggregate | null): MenuItem[] {
  const paused = tab?.paused ?? false;
  const items: MenuItem[] = [
    { id: MENU_CAPTURE, title: t('menuCapture'), contexts: ['editable'] },
    { id: MENU_FILL, title: t('menuFillWith'), contexts: FILL_CONTEXTS },
  ];

  // Uma entrada por regra; o sufixo vale quando ela só existe em iframes. Pausado: nada roda.
  const rules = new Map<string, { name: string; inTop: boolean }>();
  if (!paused) {
    for (const f of tab?.frames ?? []) {
      for (const r of f.activeRules) {
        const prev = rules.get(r.id);
        rules.set(r.id, {
          name: prev?.name ?? r.name,
          inTop: (prev?.inTop ?? false) || f.frameId === 0,
        });
      }
    }
  }
  if (rules.size === 0) {
    items.push({
      id: MENU_FILL_NONE,
      title: t('menuNoRules'),
      contexts: FILL_CONTEXTS,
      parentId: MENU_FILL,
      enabled: false,
    });
  } else {
    for (const [id, r] of rules) {
      items.push({
        id: MENU_FILL_RULE_PREFIX + id,
        title: titleSafe(r.inTop ? r.name : t('menuRuleInIframe', r.name)),
        contexts: FILL_CONTEXTS,
        parentId: MENU_FILL,
      });
    }
  }

  items.push({
    id: paused ? MENU_RESUME : MENU_PAUSE,
    title: paused ? t('menuResume') : t('menuPause'),
    contexts: ['page', 'frame'],
  });
  return items;
}

export interface MenuApi {
  removeAll(): Promise<void>;
  create(item: MenuItem): Promise<void>;
}

export interface MenuControllerDeps {
  menus: MenuApi;
  /** Aba ativa da janela em foco, com o estado agregado do registro de frames. */
  activeTab(): Promise<{ tabId: number; aggregate: TabStatusAggregate } | null>;
  debounceMs?: number;
  onError?(e: unknown): void;
}

/**
 * Reconstrói o menu (removeAll + create, idempotente). Os pedidos são agrupados por um debounce
 * curto e executados em fila: criar o mesmo id duas vezes ao mesmo tempo falharia.
 */
export function createMenuController(deps: MenuControllerDeps) {
  const wait = deps.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  let lastSignature = '';
  let lastTabId: number | undefined;

  async function rebuild(force: boolean): Promise<void> {
    const active = await deps.activeTab();
    lastTabId = active?.tabId;
    const items = buildMenuItems(active?.aggregate ?? null);
    const signature = JSON.stringify(items);
    if (!force && signature === lastSignature) return;
    lastSignature = '';
    await deps.menus.removeAll();
    for (const item of items) await deps.menus.create(item);
    lastSignature = signature;
  }

  function enqueue(force: boolean): Promise<void> {
    const run = chain.then(() => rebuild(force));
    chain = run.catch((e: unknown) => deps.onError?.(e));
    return run;
  }

  return {
    /** Reconstrução imediata (instalação e partida do service worker). */
    init: (): Promise<void> => enqueue(true).catch((e: unknown) => deps.onError?.(e)),
    /** Agenda uma reconstrução (debounce). */
    schedule(): void {
      clearTimeout(timer);
      timer = setTimeout(() => {
        enqueue(false).catch(() => undefined);
      }, wait);
    },
    /** frame/hello e frame/bye só interessam se vierem da aba do menu atual. */
    scheduleForTab(tabId: number | undefined): void {
      if (lastTabId === undefined || tabId === lastTabId) this.schedule();
    },
  };
}

export interface ClickInfo {
  menuItemId: string | number;
  frameId?: number;
  pageUrl?: string;
  frameUrl?: string;
}

export interface ClickTab {
  id?: number;
  url?: string;
}

export interface ClickDeps {
  sendToFrame(tabId: number, frameId: number, message: Message): Promise<unknown>;
  /** Injeta o content script só no frame (o clique no menu concede o `activeTab`). */
  injectFrame(tabId: number, frameId: number): Promise<unknown>;
  /** Frames registrados da aba. */
  frames(tabId: number): Promise<FrameEntry[]>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export const PICKER_START_ATTEMPTS = 8;
export const PICKER_START_DELAY_MS = 150;

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function startPickerInFrame(tabId: number, frameId: number, d: ClickDeps): Promise<void> {
  // Sem content script (ou sem alvo guardado): o elemento clicado se perdeu; liga o modo
  // "Capturar campo" normal. O script só passa a ouvir depois de ler a configuração: tenta de novo.
  await d.injectFrame(tabId, frameId);
  let last: unknown;
  for (let i = 0; i < PICKER_START_ATTEMPTS; i++) {
    try {
      await d.sendToFrame(tabId, frameId, { type: 'picker/start' });
      return;
    } catch (e) {
      last = e;
      await d.sleep(PICKER_START_DELAY_MS);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Trata o clique num item do menu (puro: tudo vem de `deps`). */
export async function handleMenuClick(
  info: ClickInfo,
  tab: ClickTab | undefined,
  deps: ClickDeps,
): Promise<void> {
  const id = String(info.menuItemId);
  const tabId = tab?.id;
  if (tabId === undefined) return;
  const frameId = info.frameId ?? 0;

  if (id === MENU_CAPTURE) {
    let captured = false;
    try {
      captured =
        (await deps.sendToFrame(tabId, frameId, { type: 'picker/capture-target' })) === true;
    } catch {
      captured = false;
    }
    if (!captured) await startPickerInFrame(tabId, frameId, deps);
    return;
  }

  if (id.startsWith(MENU_FILL_RULE_PREFIX)) {
    const ruleId = id.slice(MENU_FILL_RULE_PREFIX.length);
    const entries = await deps.frames(tabId);
    const targets = entries.filter((e) => e.activeRules.some((r) => r.id === ruleId));
    await Promise.all(
      targets.map((e) =>
        deps
          .sendToFrame(tabId, e.frameId, { type: 'run/now', payload: { ruleId } })
          .catch(() => undefined),
      ),
    );
    return;
  }

  if (id === MENU_PAUSE || id === MENU_RESUME) {
    // O host de topo: `pageUrl` é a página (não o iframe) em que o menu foi aberto.
    const host = hostOf(info.pageUrl) || hostOf(tab?.url);
    if (host === '') return;
    const settings = await deps.loadSettings();
    await deps.saveSettings(togglePausedHost(settings, host, id === MENU_PAUSE));
  }
}
