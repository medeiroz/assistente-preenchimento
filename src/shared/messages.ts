import type { Config, RunReport } from '../core/model';
import type { RecordedField, RecorderStatus } from '../core/recorder/types';

export interface TabStatus {
  host: string;
  paused: boolean;
  activeRules: { id: string; name: string; mode: 'auto' | 'button' | 'off' }[];
  lastReport: RunReport | null;
}

/** Estado de um frame da aba (o de topo tem frameId 0). */
export type FrameStatus = TabStatus & { frameId: number; url: string };

/** Status agregado da aba, somando os frames registrados (o WP-C1 passa a responder assim). */
export interface TabStatusAggregate {
  host: string;
  paused: boolean;
  frames: FrameStatus[];
}

export interface UiToast {
  report: RunReport;
  /** Preenchido pelo background (frame de origem). */
  frameId?: number;
  canUndo: boolean;
}

export interface UiButton {
  frameId?: number;
  id: string;
  label: string;
  shown: boolean;
}

export interface UiAction {
  frameId: number;
  kind: 'undo' | 'button';
  /** Id do botão (kind 'button'). */
  id?: string;
}

/** Mapa tipo da mensagem -> payload e resposta. Fonte única de verdade. */
export interface MessageMap {
  'config/get': { payload: undefined; response: Config };
  /** broadcast do background para os demais contextos */
  'config/changed': { payload: Config; response: void };
  'run/now': { payload: { ruleId?: string }; response: RunReport[] };
  'run/last-report': { payload: undefined; response: RunReport | null };
  'run/undo': { payload: { ruleId?: string }; response: RunReport[] };
  'tab/status': { payload: undefined; response: TabStatus };
  /** Frame -> background, ao iniciar o motor e quando o estado muda. */
  'frame/hello': {
    payload: {
      url: string;
      topUrl?: string;
      activeRules: TabStatus['activeRules'];
      lastReport: RunReport | null;
    };
    /** `topUrl`: URL (ou origem) do frame de topo, quando o background a conhece pela aba. */
    response: { topUrl?: string } | undefined;
  };
  'frame/bye': { payload: Record<string, never>; response: void };
  /** Frame filho -> background -> frame de topo. */
  'frame/report': { payload: { report: RunReport; frameId: number }; response: void };
  /** popup -> background: estado agregado dos frames registrados da aba. */
  'tab/frames': { payload: { tabId: number }; response: TabStatusAggregate };
  /**
   * Frame filho -> background -> frame de topo: mostra o toast no topo. Resposta (do background):
   * `true` se o topo tem motor registrado e recebeu; `false` e o frame mostra o toast sozinho.
   */
  'ui/toast': { payload: UiToast; response: boolean };
  /** Idem para o botão de ação de uma regra do frame filho (`shown: false` remove). */
  'ui/button': { payload: UiButton; response: boolean };
  /** Frame de topo -> background -> frame filho: o usuário clicou no botão/desfazer relayados. */
  'ui/action': { payload: UiAction; response: void };
  /** Background -> frame de topo: o frame filho saiu; remove os botões dele. */
  'ui/frame-gone': { payload: { frameId: number }; response: void };
  /** Frame -> background -> demais frames: a captura terminou ou foi cancelada. */
  'picker/stop': { payload: undefined; response: void };
  'site/pause': { payload: { host: string; paused: boolean }; response: void };
  /** popup -> content: liga o modo "Capturar campo". */
  'picker/start': { payload: undefined; response: void };
  /** content -> background: abre (ou foca) a página de opções para consumir `picker:draft`. */
  'options/open-draft': { payload: undefined; response: void };
  /** popup -> background: liga a gravação na aba (antes de injetar o content script). */
  'recorder/start': { payload: { tabId: number }; response: RecorderStatus };
  /**
   * popup ou content -> background: encerra a gravação. Sem `tabId`, vale a aba do remetente.
   * `discard: true` descarta sem abrir as opções.
   */
  'recorder/stop': { payload: { tabId?: number; discard?: boolean }; response: RecorderStatus };
  /** popup ou content -> background: estado da gravação (sem `tabId`, a aba do remetente). */
  'recorder/status': { payload: { tabId?: number }; response: RecorderStatus };
  /**
   * content -> background: campo alterado pelo usuário (upsert pelo localizador). Valor vazio
   * remove o campo da gravação.
   */
  'recorder/field': { payload: { field: RecordedField }; response: RecorderStatus };
  /** background -> content: liga/desliga a barra de gravação e atualiza a contagem. */
  'recorder/state': { payload: RecorderStatus; response: void };
}

export type Message = {
  [K in keyof MessageMap]: MessageMap[K]['payload'] extends undefined
    ? { type: K; payload?: undefined }
    : { type: K; payload: MessageMap[K]['payload'] };
}[keyof MessageMap];

export type MessageResponse<M extends Message['type']> = MessageMap[M]['response'];

const MESSAGE_TYPES: ReadonlySet<string> = new Set<keyof MessageMap>([
  'config/get',
  'config/changed',
  'run/now',
  'run/last-report',
  'run/undo',
  'tab/status',
  'frame/hello',
  'frame/bye',
  'frame/report',
  'tab/frames',
  'ui/toast',
  'ui/button',
  'ui/action',
  'ui/frame-gone',
  'picker/stop',
  'site/pause',
  'picker/start',
  'options/open-draft',
  'recorder/start',
  'recorder/stop',
  'recorder/status',
  'recorder/field',
  'recorder/state',
]);

export function isMessage(x: unknown): x is Message {
  if (typeof x !== 'object' || x === null) return false;
  const type = (x as { type?: unknown }).type;
  return typeof type === 'string' && MESSAGE_TYPES.has(type);
}
