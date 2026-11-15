import type { AdapterId, AdapterRef } from '../../../core/model';

export type LocatorBy = 'label' | 'selector' | 'name';
export type Mode = 'auto' | 'button' | 'off';
export type Overwrite = 'onlyIfDefault' | 'always';
/** 'auto', um adaptador conhecido ou um id desconhecido (de versão futura), mantido como está. */
export type AdapterChoice = AdapterRef;
type KnownAdapterChoice = 'auto' | AdapterId;

/** Chaves que a tela não conhece (de versões futuras): vão e voltam sem alteração. */
export type Extra = Record<string, unknown>;
export interface FieldDraft {
  id: string;
  enabled: boolean;
  locatorBy: LocatorBy;
  locatorValue: string;
  /** Propriedades do localizador de rótulo que a tela não edita, mas que não devem se perder. */
  locatorExact?: boolean;
  locatorIndex?: number;
  /** Chaves desconhecidas do localizador, do campo e da digitação (preservadas). */
  locatorExtra?: Extra;
  extra?: Extra;
  typingExtra?: Extra;
  adapter: AdapterChoice;
  value: string;
  defaultValue: string;
  /** Espera antes de preencher, em ms. null/0 = sem espera (campo vazio na tela). */
  delayMs: number | null;
  /** Simular digitação tecla por tecla. */
  typing: boolean;
  /** Intervalo entre teclas, em ms (usado só com `typing`). null = campo vazio na tela. */
  keyDelayMs: number | null;
}

export const DEFAULT_KEY_DELAY_MS = 50;

/** Adaptadores que sabem digitar tecla por tecla (os demais ignoram a opção). */
export function isKnownAdapterChoice(adapter: AdapterChoice): boolean {
  return ADAPTER_OPTIONS.some((o) => o.id === adapter);
}

export function adapterSupportsTyping(adapter: AdapterChoice): boolean {
  // Id desconhecido roda como 'auto' no motor, então se comporta como ele.
  return (
    !isKnownAdapterChoice(adapter) ||
    adapter === 'auto' ||
    adapter === 'native-text' ||
    adapter === 'date'
  );
}

export interface RuleDraft {
  /** Vazio em regra nova: o id é gerado ao salvar, a partir do nome. */
  id: string;
  isNew: boolean;
  name: string;
  enabled: boolean;
  urlPatterns: string[];
  containerSelector: string;
  containerText: string;
  settleMs: number;
  /** Preservado sem edição. */
  queryParams?: Record<string, string>;
  /** Chaves desconhecidas da regra, do gatilho, do contêiner e do comportamento (preservadas). */
  extra?: Extra;
  triggerExtra?: Extra;
  containerExtra?: Extra;
  behaviorExtra?: Extra;
  mode: Mode;
  overwrite: Overwrite;
  /** Prioridade 0-100 entre regras no mesmo formulário. null = padrão (50), não grava. */
  priority: number | null;
  fields: FieldDraft[];
}

export interface Option<T extends string> {
  id: T;
  label: string;
  description: string;
}

export const MODE_OPTIONS: readonly Option<Mode>[] = [
  {
    id: 'auto',
    label: 'Automático',
    description: 'Preenche sozinho assim que o formulário aparece na página.',
  },
  {
    id: 'button',
    label: 'Com um clique',
    description: 'Mostra um botão na página e só preenche quando você clicar nele.',
  },
  {
    id: 'off',
    label: 'Desligado',
    description: 'A regra fica guardada, mas não preenche nada.',
  },
];

export const OVERWRITE_OPTIONS: readonly Option<Overwrite>[] = [
  {
    id: 'onlyIfDefault',
    label: 'Só se o campo estiver vazio/padrão',
    description: 'Não mexe no que você ou o sistema já preencheram.',
  },
  {
    id: 'always',
    label: 'Sempre',
    description: 'Troca o valor atual do campo pelo da regra.',
  },
];

export const LOCATOR_OPTIONS: readonly Option<LocatorBy>[] = [
  { id: 'label', label: 'Rótulo', description: 'O texto que aparece ao lado do campo.' },
  { id: 'selector', label: 'Seletor CSS', description: 'Para quem conhece CSS, ex.: #nbs' },
  { id: 'name', label: 'Atributo name', description: 'O atributo name do campo, ex.: nbs' },
];

export const ADAPTER_OPTIONS: readonly Option<KnownAdapterChoice>[] = [
  { id: 'auto', label: 'Automático', description: 'A extensão descobre o tipo do campo.' },
  { id: 'native-text', label: 'Texto', description: 'Campo de texto comum.' },
  { id: 'native-select', label: 'Select nativo', description: 'Lista de seleção do navegador.' },
  {
    id: 'native-choice',
    label: 'Escolha (radio/checkbox/botões)',
    description: 'Opções para marcar ou botões de escolha.',
  },
  {
    id: 'vue-multiselect',
    label: 'Select com busca (vue-multiselect)',
    description: 'Lista com busca, comum em sistemas feitos em Vue.',
  },
  { id: 'date', label: 'Data', description: 'Campo de data.' },
];

export const LOCATOR_PLACEHOLDERS: Record<LocatorBy, string> = {
  label: 'Ex.: Código NBS',
  selector: 'Ex.: #nbs',
  name: 'Ex.: nbs',
};

export function modeLabel(mode: Mode): string {
  return MODE_OPTIONS.find((o) => o.id === mode)?.label ?? mode;
}

export function adapterLabel(adapter: AdapterChoice): string {
  return ADAPTER_OPTIONS.find((o) => o.id === adapter)?.label ?? `Desconhecido: ${adapter}`;
}

export interface BuildOptions {
  now?: Date;
  existingIds?: Iterable<string>;
  rng?: () => number;
}
