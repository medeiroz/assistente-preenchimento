import {
  migrateConfig,
  parseRule,
  type Config,
  type Rule,
  type Variable,
} from '../../../core/model';
import { generateRuleId } from './draft';

/** O que um arquivo "Adicionar regras" traz: regras e, se for uma config completa, variáveis. */
export interface Addition {
  rules: Rule[];
  variables: Variable[];
  warnings: string[];
}

export type AdditionParse = { ok: true; addition: Addition } | { ok: false; error: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Lê o texto de um arquivo para o modo "mesclar": uma regra no formato do preset OU uma
 * configuração completa exportada. Valida tudo; nunca lança.
 */
export function parseAddition(text: string): AdditionParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: 'O arquivo não parece conter uma regra nem uma configuração.' };
  }
  if (isRecord(raw.trigger)) {
    const r = parseRule(raw);
    if (!r.ok) return { ok: false, error: `Regra inválida: ${r.errors.join('; ')}` };
    return { ok: true, addition: { rules: [r.rule], variables: [], warnings: [] } };
  }
  if (typeof raw.schemaVersion === 'number') {
    const { config, warnings } = migrateConfig(raw);
    const rawRules = Array.isArray(raw.rules) ? raw.rules.length : 0;
    if (warnings.some((w) => w.includes('usando configuração vazia'))) {
      return { ok: false, error: warnings.join(' ') };
    }
    if (rawRules > 0 && config.rules.length === 0) {
      return {
        ok: false,
        error: `Nenhuma regra do arquivo é válida. ${warnings.join(' ')}`.trim(),
      };
    }
    if (config.rules.length === 0) {
      return { ok: false, error: 'O arquivo não tem nenhuma regra para adicionar.' };
    }
    return {
      ok: true,
      addition: { rules: config.rules, variables: config.variables, warnings },
    };
  }
  return {
    ok: false,
    error: 'O arquivo não parece ser uma regra nem uma configuração deste assistente.',
  };
}

export interface MergePlan {
  /** Regras a gravar (ids já resolvidos), em ordem. */
  rules: Rule[];
  /** Regras cujo id já existia e recebeu um id novo. */
  renamed: { name: string; from: string; to: string }[];
  /** Variáveis do arquivo cuja chave ainda não existe (as existentes nunca são alteradas). */
  newVariables: Variable[];
  /** Variáveis do arquivo ignoradas porque a chave já existe. */
  skippedVariables: string[];
}

/**
 * Mescla sem apagar nada: regras com id já existente ganham id novo; as regras e variáveis
 * que já existem ficam intactas.
 */
export function planMerge(
  current: Pick<Config, 'rules' | 'variables'>,
  addition: Pick<Addition, 'rules' | 'variables'>,
  opts: { rng?: () => number; now?: Date } = {},
): MergePlan {
  const taken = new Set(current.rules.map((r) => r.id));
  const updatedAt = (opts.now ?? new Date()).toISOString();
  const rules: Rule[] = [];
  const renamed: MergePlan['renamed'] = [];
  for (const incoming of addition.rules) {
    let id = incoming.id;
    if (taken.has(id)) {
      id = generateRuleId(incoming.name, taken, opts.rng);
      renamed.push({ name: incoming.name, from: incoming.id, to: id });
    }
    taken.add(id);
    rules.push({ ...incoming, id, updatedAt });
  }
  const keys = new Set(current.variables.map((v) => v.key));
  const newVariables: Variable[] = [];
  const skippedVariables: string[] = [];
  for (const v of addition.variables) {
    if (keys.has(v.key)) skippedVariables.push(v.key);
    else {
      keys.add(v.key);
      newVariables.push(v);
    }
  }
  return { rules, renamed, newVariables, skippedVariables };
}
