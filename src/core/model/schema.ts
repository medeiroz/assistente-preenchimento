import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1;

export const AdapterIdSchema = z.enum([
  'native-text',
  'native-select',
  'native-choice',
  'vue-multiselect',
  'date',
]);

export const LocatorSchema = z.discriminatedUnion('by', [
  z.object({
    by: z.literal('label'),
    text: z.string().min(1, 'o texto do rótulo não pode ser vazio'),
    exact: z.boolean().optional(),
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    by: z.literal('selector'),
    css: z.string().min(1, 'o seletor CSS não pode ser vazio'),
  }),
  z.object({
    by: z.literal('name'),
    name: z.string().min(1, 'o atributo name não pode ser vazio'),
  }),
]);

const MATCH_PATTERN = /^(https?|\*):\/\/[^/]+\/.*$/;

export const TriggerSchema = z.object({
  urlPatterns: z
    .array(
      z
        .string()
        .regex(MATCH_PATTERN, 'padrão de URL inválido (use o formato https://host/caminho/*)'),
    )
    .min(1, 'informe ao menos um padrão de URL'),
  queryParams: z.record(z.string(), z.string()).optional(),
  container: z
    .object({
      selector: z.string().min(1, 'o seletor do contêiner não pode ser vazio'),
      textContains: z.string().optional(),
    })
    .optional(),
  settleMs: z.number().int().min(0).max(10000).default(300),
});

export const BehaviorSchema = z.object({
  mode: z.enum(['auto', 'button', 'off']).default('auto'),
  overwrite: z.enum(['onlyIfDefault', 'always']).default('onlyIfDefault'),
  refill: z.literal('oncePerAppearance').default('oncePerAppearance'),
});

export const FieldRuleSchema = z.object({
  id: z.string().min(1, 'o id do campo não pode ser vazio'),
  enabled: z.boolean().default(true),
  locator: LocatorSchema,
  adapter: z.union([z.literal('auto'), AdapterIdSchema]).default('auto'),
  value: z.string(),
  defaultValue: z.string().optional(),
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
  .object({
    id: z.string().min(1, 'o id da regra não pode ser vazio'),
    name: z.string().min(1, 'o nome da regra não pode ser vazio'),
    enabled: z.boolean().default(true),
    trigger: TriggerSchema,
    behavior: BehaviorSchema.prefault({}),
    fields: z.array(FieldRuleSchema),
    updatedAt: z.iso.datetime({ message: 'data inválida (use o formato ISO 8601)' }),
  })
  .superRefine((rule, ctx) => {
    const dups = findDuplicates(rule.fields.map((f) => f.id));
    if (dups.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: `ids de campo duplicados: ${dups.join(', ')}`,
      });
    }
  });

export const VariableSchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'chave inválida (use minúsculas, números e _, começando por letra)',
    ),
  label: z.string(),
  value: z.string(),
});

export const SettingsSchema = z.object({
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
        message: `chaves de variável duplicadas: ${dupKeys.join(', ')}`,
      });
    }
    const dupIds = findDuplicates(cfg.rules.map((r) => r.id));
    if (dupIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['rules'],
        message: `ids de regra duplicados: ${dupIds.join(', ')}`,
      });
    }
  });

export type AdapterId = z.output<typeof AdapterIdSchema>;
export type Locator = z.output<typeof LocatorSchema>;
export type Trigger = z.output<typeof TriggerSchema>;
export type Behavior = z.output<typeof BehaviorSchema>;
export type FieldRule = z.output<typeof FieldRuleSchema>;
export type Rule = z.output<typeof RuleSchema>;
export type Variable = z.output<typeof VariableSchema>;
export type Settings = z.output<typeof SettingsSchema>;
export type Config = z.output<typeof ConfigSchema>;
export type RuleInput = z.input<typeof RuleSchema>;

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
