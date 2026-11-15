import {
  parseRule,
  type AdapterId,
  type AdapterRef,
  type Rule,
  type RuleInput,
} from '../../../core/model';
import { validateTemplate } from '../../../core/expressions';

export type LocatorBy = 'label' | 'selector' | 'name';
export type Mode = 'auto' | 'button' | 'off';
export type Overwrite = 'onlyIfDefault' | 'always';
/** 'auto', um adaptador conhecido ou um id desconhecido (de versão futura), mantido como está. */
export type AdapterChoice = AdapterRef;
type KnownAdapterChoice = 'auto' | AdapterId;

/** Chaves que a tela não conhece (de versões futuras): vão e voltam sem alteração. */
export type Extra = Record<string, unknown>;

function pickExtra(obj: object, known: readonly string[]): Extra | undefined {
  const out: Extra = {};
  for (const [k, v] of Object.entries(obj)) if (!known.includes(k)) out[k] = v;
  return Object.keys(out).length > 0 ? out : undefined;
}

const RULE_KEYS = ['id', 'name', 'enabled', 'trigger', 'behavior', 'fields', 'updatedAt'];
const TRIGGER_KEYS = ['urlPatterns', 'queryParams', 'container', 'settleMs'];
const CONTAINER_KEYS = ['selector', 'textContains'];
const BEHAVIOR_KEYS = ['mode', 'overwrite', 'refill'];
const FIELD_KEYS = [
  'id',
  'enabled',
  'locator',
  'adapter',
  'value',
  'defaultValue',
  'delayMs',
  'typing',
];
const LOCATOR_KEYS: Record<LocatorBy, readonly string[]> = {
  label: ['by', 'text', 'exact', 'index'],
  selector: ['by', 'css'],
  name: ['by', 'name'],
};
const TYPING_KEYS = ['keyDelayMs'];

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

// ---------------------------------------------------------------- ids

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function randomSuffix(rng: () => number): string {
  let out = '';
  while (out.length < 4) out += Math.floor(rng() * 36).toString(36);
  return out;
}

/** Slug do nome + sufixo aleatório curto, garantindo que não colide com `existingIds`. */
export function generateRuleId(
  name: string,
  existingIds: Iterable<string> = [],
  rng: () => number = Math.random,
): string {
  const taken = new Set(existingIds);
  const slug = slugify(name) || 'regra';
  for (let i = 0; i < 1000; i++) {
    const id = `${slug}-${randomSuffix(rng)}`;
    if (!taken.has(id)) return id;
  }
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** Próximo id `campo-N` ainda não usado. */
export function nextFieldId(fields: readonly { id: string }[]): string {
  const used = new Set(fields.map((f) => f.id));
  let max = 0;
  for (const id of used) {
    const m = /^campo-(\d+)$/.exec(id);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`campo-${n}`)) n++;
  return `campo-${n}`;
}

// ---------------------------------------------------------------- rascunhos

export function newFieldDraft(fields: readonly { id: string }[]): FieldDraft {
  return {
    id: nextFieldId(fields),
    enabled: true,
    locatorBy: 'label',
    locatorValue: '',
    adapter: 'auto',
    value: '',
    defaultValue: '',
    delayMs: null,
    typing: false,
    keyDelayMs: DEFAULT_KEY_DELAY_MS,
  };
}

export function newRuleDraft(): RuleDraft {
  return {
    id: '',
    isNew: true,
    name: '',
    enabled: true,
    urlPatterns: [''],
    containerSelector: '',
    containerText: '',
    settleMs: 300,
    mode: 'auto',
    overwrite: 'onlyIfDefault',
    fields: [],
  };
}

export function ruleToDraft(rule: Rule): RuleDraft {
  const draft: RuleDraft = {
    id: rule.id,
    isNew: false,
    name: rule.name,
    enabled: rule.enabled,
    urlPatterns: [...rule.trigger.urlPatterns],
    containerSelector: rule.trigger.container?.selector ?? '',
    containerText: rule.trigger.container?.textContains ?? '',
    settleMs: rule.trigger.settleMs,
    mode: rule.behavior.mode,
    overwrite: rule.behavior.overwrite,
    fields: rule.fields.map((f) => {
      const fd: FieldDraft = {
        id: f.id,
        enabled: f.enabled,
        locatorBy: f.locator.by,
        locatorValue:
          f.locator.by === 'label'
            ? f.locator.text
            : f.locator.by === 'selector'
              ? f.locator.css
              : f.locator.name,
        adapter: f.adapter,
        value: f.value,
        defaultValue: f.defaultValue ?? '',
        delayMs: f.delayMs ?? null,
        typing: f.typing !== undefined,
        keyDelayMs: f.typing?.keyDelayMs ?? DEFAULT_KEY_DELAY_MS,
      };
      const fieldExtra = pickExtra(f, FIELD_KEYS);
      if (fieldExtra) fd.extra = fieldExtra;
      const locatorExtra = pickExtra(f.locator, LOCATOR_KEYS[f.locator.by]);
      if (locatorExtra) fd.locatorExtra = locatorExtra;
      const typingExtra = f.typing ? pickExtra(f.typing, TYPING_KEYS) : undefined;
      if (typingExtra) fd.typingExtra = typingExtra;
      if (f.locator.by === 'label') {
        if (f.locator.exact !== undefined) fd.locatorExact = f.locator.exact;
        if (f.locator.index !== undefined) fd.locatorIndex = f.locator.index;
      }
      return fd;
    }),
  };
  if (rule.trigger.queryParams) draft.queryParams = { ...rule.trigger.queryParams };
  const extras: [keyof RuleDraft, Extra | undefined][] = [
    ['extra', pickExtra(rule, RULE_KEYS)],
    ['triggerExtra', pickExtra(rule.trigger, TRIGGER_KEYS)],
    ['containerExtra', rule.trigger.container && pickExtra(rule.trigger.container, CONTAINER_KEYS)],
    ['behaviorExtra', pickExtra(rule.behavior, BEHAVIOR_KEYS)],
  ];
  for (const [key, value] of extras) if (value) Object.assign(draft, { [key]: value });
  return draft;
}

export function cloneDraft(draft: RuleDraft): RuleDraft {
  return JSON.parse(JSON.stringify(draft)) as RuleDraft;
}

export function isDirty(initial: RuleDraft, current: RuleDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

function locatorInput(f: FieldDraft): unknown {
  const v = f.locatorValue.trim();
  const extra = f.locatorExtra ?? {};
  if (f.locatorBy === 'label') {
    return {
      ...extra,
      by: 'label',
      text: v,
      ...(f.locatorExact !== undefined ? { exact: f.locatorExact } : {}),
      ...(f.locatorIndex !== undefined ? { index: f.locatorIndex } : {}),
    };
  }
  if (f.locatorBy === 'selector') return { ...extra, by: 'selector', css: v };
  return { ...extra, by: 'name', name: v };
}

export interface BuildOptions {
  now?: Date;
  existingIds?: Iterable<string>;
  rng?: () => number;
}

/** Converte o rascunho no objeto que o schema valida (ainda sem validar). */
export function draftToRuleInput(draft: RuleDraft, opts: BuildOptions = {}): RuleInput {
  const name = draft.name.trim();
  const id = draft.id || generateRuleId(name, opts.existingIds, opts.rng);
  const selector = draft.containerSelector.trim();
  const text = draft.containerText.trim();
  const trigger: Record<string, unknown> = {
    ...draft.triggerExtra,
    urlPatterns: draft.urlPatterns.map((p) => p.trim()),
    settleMs: draft.settleMs,
  };
  if (draft.queryParams) trigger.queryParams = { ...draft.queryParams };
  if (selector || text) {
    trigger.container = {
      ...draft.containerExtra,
      selector,
      ...(text ? { textContains: text } : {}),
    };
  }
  return {
    ...draft.extra,
    id,
    name,
    enabled: draft.enabled,
    trigger,
    behavior: {
      ...draft.behaviorExtra,
      mode: draft.mode,
      overwrite: draft.overwrite,
      refill: 'oncePerAppearance',
    },
    fields: draft.fields.map((f) => ({
      ...f.extra,
      id: f.id,
      enabled: f.enabled,
      locator: locatorInput(f),
      adapter: f.adapter,
      value: f.value,
      ...(f.defaultValue !== '' ? { defaultValue: f.defaultValue } : {}),
      // Só entram quando definidos: o JSON de regras antigas não muda.
      ...(f.delayMs !== null && f.delayMs !== 0 ? { delayMs: f.delayMs } : {}),
      ...(f.typing ? { typing: { ...f.typingExtra, keyDelayMs: f.keyDelayMs ?? Number.NaN } } : {}),
    })),
    updatedAt: (opts.now ?? new Date()).toISOString(),
  } as RuleInput;
}

// ---------------------------------------------------------------- operações

/** Move o item de `from` para a posição final `to` (arrastar e soltar). Não muta a entrada. */
export function reorderFields<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

/**
 * Índice final ao soltar o item `from` sobre o card `over`, antes ou depois dele
 * (a linha de inserção fica entre dois cards).
 */
export function dropTarget(from: number, over: number, where: 'before' | 'after'): number {
  const insertAt = over + (where === 'after' ? 1 : 0);
  return insertAt > from ? insertAt - 1 : insertAt;
}

export function moveField<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const out = [...items];
  if (index < 0 || index >= out.length || target < 0 || target >= out.length) return out;
  const a = out[index] as T;
  const b = out[target] as T;
  out[index] = b;
  out[target] = a;
  return out;
}

function copyName(name: string, existingNames: Set<string>): string {
  let candidate = `${name} (cópia)`;
  let n = 2;
  while (existingNames.has(candidate)) candidate = `${name} (cópia ${n++})`;
  return candidate;
}

/** Cópia da regra com id novo e nome "… (cópia)". */
export function duplicateRule(
  rule: Rule,
  existing: readonly Rule[],
  opts: BuildOptions = {},
): Rule {
  const copy = JSON.parse(JSON.stringify(rule)) as Rule;
  copy.name = copyName(rule.name, new Set(existing.map((r) => r.name)));
  copy.id = generateRuleId(
    rule.name,
    existing.map((r) => r.id),
    opts.rng,
  );
  copy.updatedAt = (opts.now ?? new Date()).toISOString();
  return copy;
}

// ---------------------------------------------------------------- agrupamento por site

export const ANY_SITE = 'qualquer site';
export const NO_SITE = 'sem endereço definido';

/** Host do padrão de URL (ex.: `https://app.site.com/*` → `app.site.com`); `*` → `*`. */
export function hostOfPattern(pattern: string | undefined): string | null {
  if (!pattern) return null;
  const m = /^(?:https?|\*):\/\/([^/]+)/.exec(pattern.trim());
  const host = m?.[1];
  return host ? host : null;
}

export function siteLabel(pattern: string | undefined): string {
  const host = hostOfPattern(pattern);
  if (host === null) return NO_SITE;
  return host === '*' ? ANY_SITE : host;
}

export interface RuleGroup {
  site: string;
  rules: Rule[];
}

export function groupRulesBySite(rules: readonly Rule[]): RuleGroup[] {
  const map = new Map<string, Rule[]>();
  for (const r of rules) {
    const site = siteLabel(r.trigger.urlPatterns[0]);
    const list = map.get(site) ?? [];
    list.push(r);
    map.set(site, list);
  }
  const rank = (s: string): number => (s === ANY_SITE ? 1 : s === NO_SITE ? 2 : 0);
  return [...map.entries()]
    .map(([site, list]) => ({
      site,
      rules: [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }))
    .sort((a, b) => rank(a.site) - rank(b.site) || a.site.localeCompare(b.site, 'pt-BR'));
}

export function fieldCountLabel(n: number): string {
  return n === 1 ? '1 campo' : `${n} campos`;
}

// ---------------------------------------------------------------- validação

export interface DraftValidation {
  ok: boolean;
  rule?: Rule;
  /** Mensagens legíveis, na ordem do formulário. */
  messages: string[];
  /** Erros por chave: `name`, `urlPatterns.N`, `container`, `settleMs`, `fields.<id>.locator|value|delay|keyDelay`. */
  byKey: Record<string, string[]>;
}

function add(byKey: Record<string, string[]>, key: string, message: string): void {
  (byKey[key] ??= []).push(message);
}

/** Valida a sintaxe do valor (expressões `{{ }}`) de um campo. */
export function fieldValueError(value: string): string | null {
  const r = validateTemplate(value);
  return r.ok ? null : r.error;
}

interface Placed {
  key: string;
  where: string;
  text: string;
}

function placeIssue(draft: RuleDraft, issue: string): Placed {
  const sep = issue.indexOf(': ');
  const path = sep >= 0 ? issue.slice(0, sep) : '';
  const text = sep >= 0 ? issue.slice(sep + 2) : issue;
  const parts = path.split('.');
  if (parts[0] === 'name') return { key: 'name', where: 'Nome da regra', text };
  if (parts[0] === 'trigger' && parts[1] === 'urlPatterns') {
    const i = Number(parts[2]);
    if (parts[2] !== undefined && Number.isInteger(i)) {
      return { key: `urlPatterns.${i}`, where: `Padrão de URL ${i + 1}`, text };
    }
    return { key: 'urlPatterns', where: 'Padrões de URL', text };
  }
  if (parts[0] === 'trigger' && parts[1] === 'container') {
    return { key: 'container', where: 'Contêiner', text };
  }
  if (parts[0] === 'trigger' && parts[1] === 'settleMs') {
    return { key: 'settleMs', where: 'Espera (ms)', text };
  }
  if (parts[0] === 'fields' && parts[1] !== undefined) {
    const i = Number(parts[1]);
    const f = draft.fields[i];
    if (Number.isInteger(i) && f) {
      const sub =
        parts[2] === 'locator'
          ? 'locator'
          : parts[2] === 'value'
            ? 'value'
            : parts[2] === 'delayMs'
              ? 'delay'
              : parts[2] === 'typing'
                ? 'keyDelay'
                : 'field';
      return { key: `fields.${f.id}.${sub}`, where: `Campo ${i + 1}`, text };
    }
  }
  if (parts[0] === 'fields') return { key: 'fields', where: 'Campos', text };
  return { key: 'rule', where: '', text };
}

/** Monta e valida a regra. Erros do schema e de expressões viram mensagens em português. */
export function validateDraft(draft: RuleDraft, opts: BuildOptions = {}): DraftValidation {
  const byKey: Record<string, string[]> = {};
  const messages: string[] = [];
  const parsed = parseRule(draftToRuleInput(draft, opts));
  if (!parsed.ok) {
    for (const issue of parsed.errors) {
      const p = placeIssue(draft, issue);
      add(byKey, p.key, p.text);
      messages.push(p.where ? `${p.where}: ${p.text}` : p.text);
    }
  }
  draft.fields.forEach((f, i) => {
    const err = fieldValueError(f.value);
    if (err) {
      add(byKey, `fields.${f.id}.value`, err);
      messages.push(`Campo ${i + 1}, valor: ${err}`);
    }
  });
  if (parsed.ok && messages.length === 0) return { ok: true, rule: parsed.rule, messages, byKey };
  return { ok: false, messages, byKey };
}
