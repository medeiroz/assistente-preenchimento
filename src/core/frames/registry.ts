import type { RunReport } from '../model';
import type { FrameStatus, TabStatus, TabStatusAggregate } from '../../shared/messages';

/** Área de `storage.session` (só o que o registro usa). */
export interface SessionArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface FrameEntry {
  frameId: number;
  url: string;
  topUrl?: string;
  activeRules: TabStatus['activeRules'];
  lastReport: RunReport | null;
}

export interface FrameHello {
  url: string;
  topUrl?: string;
  activeRules: TabStatus['activeRules'];
  lastReport: RunReport | null;
}

export interface FrameRegistryDeps {
  session: SessionArea;
  /** URL da aba, quando o Chrome a entrega (precisa de permissão para o host). */
  tabUrl?(tabId: number): Promise<string | undefined>;
}

export interface FrameRegistry {
  hello(tabId: number, frameId: number, hello: FrameHello): Promise<void>;
  bye(tabId: number, frameId: number): Promise<void>;
  tabRemoved(tabId: number): Promise<void>;
  /** Navegação do frame de topo: tudo o que estava registrado morreu junto. */
  tabUpdated(tabId: number, change: { status?: string; url?: string }): Promise<void>;
  has(tabId: number, frameId: number): Promise<boolean>;
  frames(tabId: number): Promise<FrameEntry[]>;
  /** Estado agregado; `frames` vazio quando nada está registrado. */
  aggregate(tabId: number, pausedHosts: readonly string[]): Promise<TabStatusAggregate>;
}

const keyOf = (tabId: number): string => `frames:${tabId}`;

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isEntry(x: unknown): x is FrameEntry {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as FrameEntry).frameId === 'number' &&
    typeof (x as FrameEntry).url === 'string' &&
    Array.isArray((x as FrameEntry).activeRules)
  );
}

/**
 * Frames com motor, por aba, em `storage.session` (sobrevive ao service worker dormir). As
 * gravações são serializadas: vários frames mandam `frame/hello` quase juntos.
 */
export function createFrameRegistry(deps: FrameRegistryDeps): FrameRegistry {
  let chain: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function read(tabId: number): Promise<FrameEntry[]> {
    const raw = (await deps.session.get(keyOf(tabId)))[keyOf(tabId)];
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
  }

  async function write(tabId: number, entries: FrameEntry[]): Promise<void> {
    if (entries.length === 0) await deps.session.remove(keyOf(tabId));
    else await deps.session.set({ [keyOf(tabId)]: entries });
  }

  return {
    hello: (tabId, frameId, h) =>
      serial(async () => {
        const entry: FrameEntry = {
          frameId,
          url: h.url,
          activeRules: h.activeRules,
          lastReport: h.lastReport,
        };
        if (h.topUrl) entry.topUrl = h.topUrl;
        const rest = (await read(tabId)).filter((e) => e.frameId !== frameId);
        await write(
          tabId,
          [...rest, entry].sort((a, b) => a.frameId - b.frameId),
        );
      }),
    bye: (tabId, frameId) =>
      serial(async () => {
        const all = await read(tabId);
        const rest = all.filter((e) => e.frameId !== frameId);
        if (rest.length !== all.length) await write(tabId, rest);
      }),
    tabRemoved: (tabId) => serial(() => deps.session.remove(keyOf(tabId))),
    tabUpdated: (tabId, change) =>
      serial(async () => {
        if (change.status === 'loading' && change.url !== undefined) {
          await deps.session.remove(keyOf(tabId));
        }
      }),
    has: (tabId, frameId) =>
      serial(async () => (await read(tabId)).some((e) => e.frameId === frameId)),
    frames: (tabId) => serial(() => read(tabId)),
    aggregate: (tabId, pausedHosts) =>
      serial(async () => {
        const entries = await read(tabId);
        const top = entries.find((e) => e.frameId === 0);
        let host = hostOf(top?.url);
        if (host === '') host = hostOf(entries.find((e) => e.topUrl)?.topUrl);
        if (host === '' && entries.length > 0) {
          host = hostOf(await deps.tabUrl?.(tabId).catch(() => undefined));
        }
        const paused = pausedHosts.includes(host);
        const frames: FrameStatus[] = entries.map((e) => ({
          frameId: e.frameId,
          url: e.url,
          host,
          paused,
          activeRules: e.activeRules,
          lastReport: e.lastReport,
        }));
        return { host, paused, frames };
      }),
  };
}
