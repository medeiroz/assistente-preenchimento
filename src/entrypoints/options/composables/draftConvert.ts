import type { Rule, RuleInput } from '../../../core/model';
import { generateRuleId, nextFieldId } from './draftIds';
import {
  DEFAULT_KEY_DELAY_MS,
  type BuildOptions,
  type Extra,
  type FieldDraft,
  type LocatorBy,
  type RuleDraft,
} from './draftTypes';

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
