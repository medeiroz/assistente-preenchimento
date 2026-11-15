import { buildRecordingDraft, parseRecorderSession, upsertField } from './session';
import {
  RECORDER_SESSION_KEY,
  RECORDING_DRAFT_KEY,
  type RecordedField,
  type RecorderSession,
  type RecorderStatus,
} from './types';

/** Subconjunto de `browser.storage.*` usado aqui. */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface RecorderBackgroundDeps {
  /** `storage.session`: a sessão em andamento. */
  session: StorageArea;
  /** `storage.local`: o rascunho deixado para as opções. */
  local: StorageArea;
  /** Empurra o estado para o content script da aba (pode falhar: o script pode não existir). */
  sendState(tabId: number, status: RecorderStatus): Promise<unknown>;
  openOptions(): Promise<void>;
  /** Reinjeta o content script na aba (pode falhar: sem permissão de host). */
  inject(tabId: number): Promise<unknown>;
  now?(): number;
  /** Tempo máximo (ms) de cada chamada a `inject`, `sendState` e `openOptions`; padrão 3000. */
  depTimeoutMs?: number;
}

export interface RecorderBackground {
  start(tabId: number): Promise<RecorderStatus>;
  status(tabId: number | undefined): Promise<RecorderStatus>;
  field(senderTabId: number | undefined, field: RecordedField): Promise<RecorderStatus>;
  stop(
    tabId: number | undefined,
    senderTabId: number | undefined,
    discard?: boolean,
  ): Promise<RecorderStatus>;
  /** `chrome.tabs.onUpdated`: reinjeta o content script depois de uma navegação completa. */
  tabUpdated(tabId: number, status: string | undefined): Promise<void>;
  /** `chrome.tabs.onRemoved`: encerra (sem descartar) a gravação da aba fechada. */
  tabRemoved(tabId: number): Promise<void>;
}

const INACTIVE: RecorderStatus = { active: false, count: 0 };

/**
 * Lógica da gravação no service worker. Toda mutação passa por uma fila de promessas: os
 * campos chegam em rajada e dois "ler-alterar-gravar" simultâneos perderiam atualizações.
 */
export function createRecorderBackground(deps: RecorderBackgroundDeps): RecorderBackground {
  const now = deps.now ?? Date.now;
  const depTimeoutMs = deps.depTimeoutMs ?? 3000;
  let chain: Promise<unknown> = Promise.resolve();

  /** Uma chamada que nunca termina travaria a fila inteira: vira falha após o prazo. */
  function guarded<T>(call: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), depTimeoutMs);
      let promise: Promise<T>;
      try {
        promise = call();
      } catch (e) {
        clearTimeout(timer);
        reject(e);
        return;
      }
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = chain.then(job, job);
    chain = result.catch(() => undefined);
    return result;
  }

  async function load(): Promise<RecorderSession | null> {
    const raw = await deps.session.get(RECORDER_SESSION_KEY);
    return parseRecorderSession(raw[RECORDER_SESSION_KEY]);
  }

  async function push(tabId: number, status: RecorderStatus): Promise<void> {
    try {
      await guarded(() => deps.sendState(tabId, status));
    } catch {
      // Sem content script na aba (ainda não injetado ou aba fechada): ele pergunta no boot.
    }
  }

  /** Grava o rascunho (se houver campos) ANTES de abrir as opções, e limpa a sessão. */
  async function finish(session: RecorderSession, discard: boolean): Promise<void> {
    await deps.session.remove(RECORDER_SESSION_KEY);
    if (discard || session.fields.length === 0) return;
    await deps.local.set({ [RECORDING_DRAFT_KEY]: buildRecordingDraft(session, now()) });
    try {
      await guarded(() => deps.openOptions());
    } catch {
      // O rascunho já está salvo; se as opções não abrirem, ele aparece na próxima abertura.
    }
  }

  return {
    start: (tabId) =>
      enqueue(async () => {
        const previous = await load();
        if (previous && previous.tabId !== tabId) await push(previous.tabId, INACTIVE);
        const session: RecorderSession = { tabId, startedAt: now(), fields: [] };
        await deps.session.set({ [RECORDER_SESSION_KEY]: session });
        const status = { active: true, count: 0 };
        // Responde já com a sessão gravada: o popup não espera a injeção. Quem injeta e avisa a
        // aba é um trabalho seguinte na mesma fila (ordem preservada com campo/status/parar); o
        // content script também pergunta `recorder/status` ao iniciar.
        void enqueue(async () => {
          try {
            await guarded(() => deps.inject(tabId));
          } catch {
            // Sem permissão de host nessa página: a barra não aparece, nada a fazer.
          }
          await push(tabId, status);
        });
        return status;
      }),

    status: (tabId) =>
      enqueue(async () => {
        const session = await load();
        if (!session || tabId === undefined || session.tabId !== tabId) return INACTIVE;
        return { active: true, count: session.fields.length };
      }),

    field: (senderTabId, field) =>
      enqueue(async () => {
        const session = await load();
        if (!session || senderTabId === undefined || session.tabId !== senderTabId) return INACTIVE;
        session.fields = upsertField(session.fields, field);
        await deps.session.set({ [RECORDER_SESSION_KEY]: session });
        return { active: true, count: session.fields.length };
      }),

    stop: (tabId, senderTabId, discard = false) =>
      enqueue(async () => {
        const target = tabId ?? senderTabId;
        const session = await load();
        if (!session || (target !== undefined && session.tabId !== target)) return INACTIVE;
        await finish(session, discard);
        await push(session.tabId, INACTIVE);
        return INACTIVE;
      }),

    tabUpdated: (tabId, status) =>
      enqueue(async () => {
        if (status !== 'complete') return;
        const session = await load();
        if (!session || session.tabId !== tabId) return;
        try {
          await guarded(() => deps.inject(tabId));
        } catch {
          // Sem permissão de host nessa página: nada a fazer.
        }
      }),

    tabRemoved: (tabId) =>
      enqueue(async () => {
        const session = await load();
        if (!session || session.tabId !== tabId) return;
        await finish(session, false);
      }),
  };
}
