import type { RecorderStatus } from '../../../core/recorder/types';
import { isStaticallyCovered, toOriginPattern } from '../../../shared/permissions';

export interface StartRecordingDeps {
  requestPermission(origin: string): Promise<boolean>;
  sendStart(tabId: number): Promise<RecorderStatus>;
  executeScript(injection: {
    target: { tabId: number };
    files: [string, ...string[]];
  }): Promise<unknown>;
  scriptFile: string;
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
 * Liga a gravação: (1) pede a permissão do site, para o background reinjetar o content script
 * depois de navegações completas do wizard; (2) grava a sessão no background; (3) injeta o
 * content script (que mostra a barra de gravação). Chamado de dentro do clique: o pedido de
 * permissão começa de forma síncrona (a URL da aba é lida antes, ao abrir o popup). O Chrome não
 * pergunta de novo por origens já concedidas. Se o usuário negar, a gravação segue valendo só
 * para a página atual (o popup fecha em seguida, então não há onde avisar).
 */
export async function startRecording(
  tabId: number,
  tabUrl: string | undefined,
  deps: StartRecordingDeps,
): Promise<void> {
  const origin = originToRequest(tabUrl, deps.statics);
  const asking = origin === null ? Promise.resolve(false) : safe(deps.requestPermission(origin));
  await asking;
  try {
    await deps.sendStart(tabId);
  } catch (e) {
    throw new Error(`Não foi possível iniciar a gravação: ${reason(e)}`);
  }
  try {
    await deps.executeScript({ target: { tabId }, files: [deps.scriptFile] });
  } catch (e) {
    throw new Error(
      `Não foi possível gravar nesta página. Páginas internas do Chrome e a Chrome Web Store não permitem extensões (${reason(e)}).`,
    );
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
