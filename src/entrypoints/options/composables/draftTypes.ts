import type { AdapterId, AdapterRef } from '../../../core/model';
import { t } from '../../../core/i18n';

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
/** Espera padrão antes do primeiro campo de uma regra (a página costuma terminar de montar o formulário). */
export const DEFAULT_FIRST_FIELD_DELAY_MS = 300;

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
  /** Atua também em iframes (`trigger.frames: 'all'`). Ausente/false = só o frame de topo; não grava. */
  allFrames?: boolean;
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
    get label() {
      return t('modeAuto');
    },
    get description() {
      return t('modeAutoDesc');
    },
  },
  {
    id: 'button',
    get label() {
      return t('modeButton');
    },
    get description() {
      return t('modeButtonDesc');
    },
  },
  {
    id: 'off',
    get label() {
      return t('modeOff');
    },
    get description() {
      return t('modeOffDesc');
    },
  },
];

export const OVERWRITE_OPTIONS: readonly Option<Overwrite>[] = [
  {
    id: 'onlyIfDefault',
    get label() {
      return t('overwriteIfEmpty');
    },
    get description() {
      return t('overwriteIfEmptyDesc');
    },
  },
  {
    id: 'always',
    get label() {
      return t('overwriteAlways');
    },
    get description() {
      return t('overwriteAlwaysDesc');
    },
  },
];

export const LOCATOR_OPTIONS: readonly Option<LocatorBy>[] = [
  {
    id: 'label',
    get label() {
      return t('locLabel');
    },
    get description() {
      return t('locLabelDesc');
    },
  },
  {
    id: 'selector',
    get label() {
      return t('locSelector');
    },
    get description() {
      return t('locSelectorDesc');
    },
  },
  {
    id: 'name',
    get label() {
      return t('locName');
    },
    get description() {
      return t('locNameDesc');
    },
  },
];

export const ADAPTER_OPTIONS: readonly Option<KnownAdapterChoice>[] = [
  {
    id: 'auto',
    get label() {
      return t('modeAuto');
    },
    get description() {
      return t('adAutoDesc');
    },
  },
  {
    id: 'native-text',
    get label() {
      return t('typeText');
    },
    get description() {
      return t('adTextDesc');
    },
  },
  {
    id: 'native-select',
    get label() {
      return t('adSelectLabel');
    },
    get description() {
      return t('adSelectDesc');
    },
  },
  {
    id: 'native-choice',
    get label() {
      return t('adChoiceLabel');
    },
    get description() {
      return t('adChoiceDesc');
    },
  },
  {
    id: 'vue-multiselect',
    get label() {
      return t('adVueLabel');
    },
    get description() {
      return t('adVueDesc');
    },
  },
  {
    id: 'date',
    get label() {
      return t('typeDate');
    },
    get description() {
      return t('adDateDesc');
    },
  },
  {
    id: 'contenteditable',
    get label() {
      return t('adEditableLabel');
    },
    get description() {
      return t('adEditableDesc');
    },
  },
  {
    id: 'react-select',
    label: 'React-Select',
    get description() {
      return t('adReactDesc');
    },
  },
  {
    id: 'select2',
    label: 'Select2',
    get description() {
      return t('adSelect2Desc');
    },
  },
];

export const LOCATOR_PLACEHOLDERS: Record<LocatorBy, string> = {
  get label() {
    return t('locLabelPlaceholder');
  },
  get selector() {
    return t('locSelectorPlaceholder');
  },
  get name() {
    return t('locNamePlaceholder');
  },
};

export function modeLabel(mode: Mode): string {
  return MODE_OPTIONS.find((o) => o.id === mode)?.label ?? mode;
}

export function adapterLabel(adapter: AdapterChoice): string {
  return ADAPTER_OPTIONS.find((o) => o.id === adapter)?.label ?? t('adUnknown', adapter);
}

export interface BuildOptions {
  now?: Date;
  existingIds?: Iterable<string>;
  rng?: () => number;
}
