import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1;

export const AdapterIdSchema = z.enum([
  'native-text',
  'native-select',
  'native-choice',
  'vue-multiselect',
  'date',
]);

// Todos os objetos aceitam chaves desconhecidas (z.looseObject) e as devolvem intactas:
// versões futuras podem acrescentar campos, e esta versão não deve apagá-los ao salvar.
export const LocatorSchema = z.discriminatedUnion('by', [
  z.looseObject({
    by: z.literal('label'),
    text: z.string().min(1, 'o texto do rótulo não pode ser vazio'),
    exact: z.boolean().optional(),
    index: z.number().int().min(0).optional(),
  }),
  z.looseObject({
    by: z.literal('selector'),
    // Aceita a cadeia `a >>> b >>> c` (atravessa shadow roots abertos). Equivalente local de
    // splitDeepSelector (core/locator), para o modelo não depender do locator.
    css: z
      .string()
      .min(1, 'o seletor CSS não pode ser vazio')
      .refine((css) => css.split('>>>').every((seg) => seg.trim() !== ''), {
        message:
          'seletor com ">>>" inválido: cada trecho antes e depois de ">>>" precisa ter um seletor CSS',
      }),
  }),
  z.looseObject({
    by: z.literal('name'),
    name: z.string().min(1, 'o atributo name não pode ser vazio'),
  }),
]);

const MATCH_PATTERN = /^(https?|\*):\/\/[^/]+\/.*$/;

export const TriggerSchema = z.looseObject({
  urlPatterns: z
    .array(
      z
        .string()
        .regex(MATCH_PATTERN, 'padrão de URL inválido (use o formato https://host/caminho/*)'),
    )
    .min(1, 'informe ao menos um padrão de URL'),
  queryParams: z.record(z.string(), z.string()).optional(),
  container: z
    .looseObject({
      selector: z.string().min(1, 'o seletor do contêiner não pode ser vazio'),
      textContains: z.string().optional(),
    })
    .optional(),
  settleMs: z.number().int().min(0).max(10000).default(300),
  /** Em quais frames a regra roda. Ausente = 'top' (ver triggerFrames). */
  frames: z.enum(['top', 'all'], "frames deve ser 'top' ou 'all'").optional(),
});

export const BehaviorSchema = z.looseObject({
  mode: z.enum(['auto', 'button', 'off']).default('auto'),
  overwrite: z.enum(['onlyIfDefault', 'always']).default('onlyIfDefault'),
  refill: z.literal('oncePerAppearance').default('oncePerAppearance'),
});

export const FieldRuleSchema = z.looseObject({
  id: z.string().min(1, 'o id do campo não pode ser vazio'),
  enabled: z.boolean().default(true),
  locator: LocatorSchema,
  // Qualquer id não vazio: um adaptador criado por versão futura não descarta a regra.
  // Em tempo de execução, id desconhecido vale como 'auto' (ver adapters/registry.ts).
  adapter: z
    .string()
    .min(1, 'o adaptador não pode ser vazio')
    .default('auto')
    .transform((id): AdapterRef => id),
  value: z.string(),
  defaultValue: z.string().optional(),
  /** Espera (ms) ANTES de localizar e preencher este campo. Ausente = sem espera. */
  delayMs: z
    .number('o atraso deve ser um número')
    .int('o atraso deve ser um número inteiro de milissegundos')
    .min(0, 'o atraso não pode ser negativo')
    .max(60000, 'o atraso máximo é 60000 ms (60 s)')
    .optional(),
  /** Presença = simular digitação tecla por tecla, com este intervalo entre as teclas. */
  typing: z
    .looseObject({
      keyDelayMs: z
        .number('o intervalo entre teclas deve ser um número')
        .int('o intervalo entre teclas deve ser um número inteiro de milissegundos')
        .min(0, 'o intervalo entre teclas não pode ser negativo')
        .max(2000, 'o intervalo máximo entre teclas é 2000 ms'),
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
    id: z.string().min(1, 'o id da regra não pode ser vazio'),
    name: z.string().min(1, 'o nome da regra não pode ser vazio'),
    enabled: z.boolean().default(true),
    /** Inteiro 0-100; maior vence. Ausente = 50 (ver rulePriority). */
    priority: z
      .number('a prioridade deve ser um número')
      .int('a prioridade deve ser um número inteiro')
      .min(0, 'a prioridade mínima é 0')
      .max(100, 'a prioridade máxima é 100')
      .optional(),
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

export const VariableSchema = z.looseObject({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'chave inválida (use minúsculas, números e _, começando por letra)',
    ),
  label: z.string(),
  value: z.string(),
  /**
   * Ausente = 'sync' (ver variableScope). Variável 'local' grava no sync só key, label, scope e
   * `value: ''`; o valor real fica em storage.local (implementado no WP-C3).
   */
  scope: z.enum(['sync', 'local'], "scope deve ser 'sync' ou 'local'").optional(),
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
