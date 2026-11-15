import type { RecorderStatus } from '../../../core/recorder/types';
import { isStaticallyCovered, toOriginPattern } from '../../../shared/permissions';

export interface StartRecordingDeps {
  requestPermission(origin: string): Promise<boolean>;
  sendStart(tabId: number): Promise<RecorderStatus>;
  /** Origens que o manifest já cobre. */
  statics?: readonly string[];
}

/** Padrão de permissão (`https://host/*`) a pedir para a URL da aba; null se não se aplica. */
export function originToRequest(
  url: string | undefined,
  statics?: readonly string[],
): string | null {
  if (!url?.startsWith('https://')) return null;
  let origin: string | null = null;
  try {
    origin = toOriginPattern(`${new URL(url).origin}/*`);
  } catch {
    return null;
  }
  if (origin === null || isStaticallyCovered(origin, statics)) return null;
  return origin;
}

/**
 * Liga a gravação. Chamado de dentro do clique: o pedido de permissão do site (para o
 * background reinjetar o content script depois de navegações completas) e o `recorder/start`
 * saem juntos e de forma síncrona, sem um esperar o outro. O Chrome pode fechar o popup durante
 * o pedido de permissão; por isso a sessão não depende dele, e o próprio background injeta o
 * content script. Só o `recorder/start` pode falhar a operação; permissão negada ou com erro
 * deixa a gravação valendo apenas para a página atual.
 */
export async function startRecording(
  tabId: number,
  tabUrl: string | undefined,
  deps: StartRecordingDeps,
): Promise<void> {
  const origin = originToRequest(tabUrl, deps.statics);
  const asking = origin === null ? Promise.resolve(false) : safe(deps.requestPermission(origin));
  const starting = deps.sendStart(tabId);
  const [, started] = await Promise.allSettled([asking, starting]);
  if (started.status === 'rejected') {
    throw new Error(`Não foi possível iniciar a gravação: ${reason(started.reason)}`);
  }
}

function safe(p: Promise<boolean>): Promise<boolean> {
  return p.catch(() => false);
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Estado da gravação para este popup; qualquer falha vale como "inativa". */
export async function recorderStatus(
  tabId: number,
  send: (tabId: number) => Promise<RecorderStatus>,
): Promise<RecorderStatus> {
  try {
    const s = await send(tabId);
    return s && typeof s.active === 'boolean'
      ? { active: s.active, count: Number(s.count) || 0 }
      : { active: false, count: 0 };
  } catch {
    return { active: false, count: 0 };
  }
}
