import type { Config, RunReport } from '../core/model';

export interface TabStatus {
  host: string;
  paused: boolean;
  activeRules: { id: string; name: string; mode: 'auto' | 'button' | 'off' }[];
  lastReport: RunReport | null;
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
  'site/pause': { payload: { host: string; paused: boolean }; response: void };
  /** popup -> content: liga o modo "Capturar campo". */
  'picker/start': { payload: undefined; response: void };
  /** content -> background: abre (ou foca) a página de opções para consumir `picker:draft`. */
  'options/open-draft': { payload: undefined; response: void };
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
  'site/pause',
  'picker/start',
  'options/open-draft',
]);

export function isMessage(x: unknown): x is Message {
  if (typeof x !== 'object' || x === null) return false;
  const type = (x as { type?: unknown }).type;
  return typeof type === 'string' && MESSAGE_TYPES.has(type);
}
