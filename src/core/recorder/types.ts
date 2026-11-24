import type { Capture, CaptureContainer } from '../locator';

/**
 * Gravação de preenchimento (contrato).
 *
 * O usuário liga a gravação numa aba, preenche o formulário normalmente (inclusive wizards com
 * navegação completa ou rotas de SPA) e para. A extensão abre as opções com regras sugeridas e
 * os valores já preenchidos.
 *
 * Fluxo:
 *  popup ──recorder/start──► background (grava a sessão em storage.session)
 *  content (a cada campo alterado pelo usuário) ──recorder/field──► background (upsert)
 *  background ──recorder/state──► content (liga/desliga a barra; atualiza a contagem)
 *  content ao carregar ──recorder/status──► background (retoma depois de navegar)
 *  popup ou barra da página ──recorder/stop──► background
 *      └─ grava RecordingDraft em storage.local e abre/foca as opções, que consomem e apagam.
 */

/** `storage.session`: sessão em andamento (sobrevive ao reinício do service worker). */
export const RECORDER_SESSION_KEY = 'recorder:session';

/** `storage.local`: rascunho de consumo único deixado para a página de opções. */
export const RECORDING_DRAFT_KEY = 'recorder:draft';

/** Rascunhos mais antigos que isto são descartados pelas opções. */
export const RECORDING_DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

/** Um campo gravado: a captura (localizador, adapter, contêiner) + o valor final escolhido. */
export interface RecordedField {
  capture: Capture;
  /** Valor lido pelo adapter, no formato que o próprio adapter aceita em `write`. */
  value: string;
  /** URL completa da página no momento da gravação (informativa). */
  url: string;
  recordedAt: number;
}

export interface RecorderSession {
  tabId: number;
  startedAt: number;
  /** Ordem da primeira gravação de cada campo; um campo regravado mantém a posição. */
  fields: RecordedField[];
}

/** Campos de uma mesma página/contêiner: vira uma regra sugerida. */
export interface RecordingGroup {
  urlPattern: string;
  /** 'all' quando os campos foram gravados num iframe. */
  frames?: 'all';
  container?: CaptureContainer;
  fields: RecordedField[];
}

export interface RecordingDraft {
  createdAt: number;
  groups: RecordingGroup[];
}

/** Estado devolvido ao popup e à barra da página. */
export interface RecorderStatus {
  active: boolean;
  count: number;
}
