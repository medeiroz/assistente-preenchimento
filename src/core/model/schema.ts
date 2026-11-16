import { z } from 'zod';
import { t } from '../i18n';

/** Mensagem preguiçosa do Zod: o idioma vale no momento da validação, não no carregamento. */
const tl = (key: string) => ({ error: () => t(key) });

export const CURRENT_SCHEMA_VERSION = 1;

export const AdapterIdSchema = z.enum([
  'native-text',
  'native-select',
  'native-choice',
  'vue-multiselect',
  'date',
  'contenteditable',
  'react-select',
  'select2',
]);

// Todos os objetos aceitam chaves desconhecidas (z.looseObject) e as devolvem intactas:
// versões futuras podem acrescentar campos, e esta versão não deve apagá-los ao salvar.
export const LocatorSchema = z.discriminatedUnion('by', [
  z.looseObject({
    by: z.literal('label'),
    text: z.string().min(1, tl('vLabelTextEmpty')),
    exact: z.boolean().optional(),
    index: z.number().int().min(0).optional(),
  }),
  z.looseObject({
    by: z.literal('selector'),
    // Aceita a cadeia `a >>> b >>> c` (atravessa shadow roots abertos). Equivalente local de
    // splitDeepSelector (core/locator), para o modelo não depender do locator.
    css: z
      .string()
      .min(1, tl('vCssEmpty'))
      .refine((css) => css.split('>>>').every((seg) => seg.trim() !== ''), {
        error: () => t('vCssDeepInvalid'),
      }),
  }),
  z.looseObject({
    by: z.literal('name'),
    name: z.string().min(1, tl('vNameAttrEmpty')),
  }),
]);

const MATCH_PATTERN = /^(https?|\*):\/\/[^/]+\/.*$/;

export const TriggerSchema = z.looseObject({
  urlPatterns: z
    .array(z.string().regex(MATCH_PATTERN, tl('vUrlPatternInvalid')))
    .min(1, tl('vUrlPatternRequired')),
  queryParams: z.record(z.string(), z.string()).optional(),
  container: z
    .looseObject({
      selector: z.string().min(1, tl('vContainerEmpty')),
      textContains: z.string().optional(),
    })
    .optional(),
  settleMs: z.number().int().min(0).max(10000).default(300),
  /** Em quais frames a regra roda. Ausente = 'top' (ver triggerFrames). */
  frames: z.enum(['top', 'all'], tl('vFramesEnum')).optional(),
});

export const BehaviorSchema = z.looseObject({
  mode: z.enum(['auto', 'button', 'off']).default('auto'),
  overwrite: z.enum(['onlyIfDefault', 'always']).default('onlyIfDefault'),
  refill: z.literal('oncePerAppearance').default('oncePerAppearance'),
});

export const FieldRuleSchema = z.looseObject({
  id: z.string().min(1, tl('vFieldIdEmpty')),
  enabled: z.boolean().default(true),
  locator: LocatorSchema,
  // Qualquer id não vazio: um adaptador criado por versão futura não descarta a regra.
  // Em tempo de execução, id desconhecido vale como 'auto' (ver adapters/registry.ts).
  adapter: z
    .string()
    .min(1, tl('vAdapterEmpty'))
    .default('auto')
    .transform((id): AdapterRef => id),
  value: z.string(),
  defaultValue: z.string().optional(),
  /** Espera (ms) ANTES de localizar e preencher este campo. Ausente = sem espera. */
  delayMs: z
    .number(tl('vDelayNumber'))
    .int(tl('vDelayInt'))
    .min(0, tl('vDelayNegative'))
    .max(60000, tl('vDelayMax'))
    .optional(),
  /** Presença = simular digitação tecla por tecla, com este intervalo entre as teclas. */
  typing: z
    .looseObject({
      keyDelayMs: z
        .number(tl('vKeyDelayNumber'))
        .int(tl('vKeyDelayInt'))
        .min(0, tl('vKeyDelayNegative'))
        .max(2000, tl('vKeyDelayMax')),
    })
    .optional(),
});

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
}

export const RuleSchema = z
  .looseObject({
    id: z.string().min(1, tl('vRuleIdEmpty')),
    name: z.string().min(1, tl('vRuleNameEmpty')),
    enabled: z.boolean().default(true),
    /** Inteiro 0-100; maior vence. Ausente = 50 (ver rulePriority). */
    priority: z
      .number(tl('vPriorityNumber'))
      .int(tl('vPriorityInt'))
      .min(0, tl('vPriorityMin'))
      .max(100, tl('vPriorityMax'))
      .optional(),
    trigger: TriggerSchema,
    behavior: BehaviorSchema.prefault({}),
    fields: z.array(FieldRuleSchema),
    updatedAt: z.iso.datetime(tl('vDateInvalid')),
  })
  .superRefine((rule, ctx) => {
    const dups = findDuplicates(rule.fields.map((f) => f.id));
    if (dups.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: t('vDupFieldIds', dups.join(', ')),
      });
    }
  });

export const VariableSchema = z.looseObject({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, tl('vVarKeyInvalid')),
  label: z.string(),
  value: z.string(),
  /**
   * Ausente = 'sync' (ver variableScope). Variável 'local' grava no sync só key, label, scope e
   * `value: ''`; o valor real fica em storage.local (implementado no WP-C3).
   */
  scope: z.enum(['sync', 'local'], tl('vScopeEnum')).optional(),
});

export const SettingsSchema = z.looseObject({
  pausedHosts: z.array(z.string()).default([]),
});

export const ConfigSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    settings: SettingsSchema,
    variables: z.array(VariableSchema),
    rules: z.array(RuleSchema),
  })
  .superRefine((cfg, ctx) => {
    const dupKeys = findDuplicates(cfg.variables.map((v) => v.key));
    if (dupKeys.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables'],
        message: t('vDupVarKeys', dupKeys.join(', ')),
      });
    }
    const dupIds = findDuplicates(cfg.rules.map((r) => r.id));
    if (dupIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['rules'],
        message: t('vDupRuleIds', dupIds.join(', ')),
      });
    }
  });

export type AdapterId = z.output<typeof AdapterIdSchema>;
/** Id de adaptador conhecido, 'auto', ou um id desconhecido (vindo de versão futura). */
export type AdapterRef = 'auto' | AdapterId | (string & {});
export type Locator = z.output<typeof LocatorSchema>;
export type Trigger = z.output<typeof TriggerSchema>;
export type Behavior = z.output<typeof BehaviorSchema>;
export type FieldRule = z.output<typeof FieldRuleSchema>;
export type Rule = z.output<typeof RuleSchema>;
export type Variable = z.output<typeof VariableSchema>;
export type Settings = z.output<typeof SettingsSchema>;
export type Config = z.output<typeof ConfigSchema>;
export type RuleInput = z.input<typeof RuleSchema>;

export const DEFAULT_RULE_PRIORITY = 50;

/** Prioridade efetiva da regra (ausente = 50). */
export function rulePriority(rule: Pick<Rule, 'priority'>): number {
  return rule.priority ?? DEFAULT_RULE_PRIORITY;
}

/** Escopo efetivo da variável (ausente = 'sync'). */
export function variableScope(v: Pick<Variable, 'scope'>): 'sync' | 'local' {
  return v.scope ?? 'sync';
}

/** Frames em que o gatilho vale (ausente = 'top'). */
export function triggerFrames(t: Pick<Trigger, 'frames'>): 'top' | 'all' {
  return t.frames ?? 'top';
}

/** Converte os issues do Zod em mensagens "caminho: motivo". */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const p = i.path.map(String).join('.');
    return p ? `${p}: ${i.message}` : i.message;
  });
}

export function parseRule(
  raw: unknown,
): { ok: true; rule: Rule } | { ok: false; errors: string[] } {
  const result = RuleSchema.safeParse(raw);
  if (result.success) return { ok: true, rule: result.data };
  return { ok: false, errors: formatZodIssues(result.error) };
}

export function emptyConfig(): Config {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { pausedHosts: [] },
    variables: [],
    rules: [],
  };
}
