import type { Rule, Variable } from '../../../core/model';
import { t } from '../../../core/i18n';

/** Mesmo padrão do VariableSchema (src/core/model/schema.ts). */
export const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Mensagem amigável para uma chave, ou null se for válida. Não checa unicidade. */
export function keyError(key: string): string | null {
  const k = key.trim();
  if (k === '') return t('varKeyRequired');
  return VARIABLE_KEY_PATTERN.test(k) ? null : t('varKeyInvalid');
}

export interface VariableRow {
  /** Identificador estável só da tela (não é a chave). */
  uid: number;
  key: string;
  label: string;
  value: string;
  /** 'local': o valor fica só neste navegador (não sincroniza). */
  scope: 'sync' | 'local';
  /** Chaves desconhecidas (de versões futuras), preservadas ao salvar. */
  extra?: Record<string, unknown>;
}

/** Erros por `uid` (chave inválida, vazia ou repetida). Linhas válidas não aparecem. */
export function validateVariableRows(rows: readonly VariableRow[]): Map<number, string> {
  const errors = new Map<number, string>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.key.trim();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const r of rows) {
    const k = r.key.trim();
    const e = keyError(k);
    if (e) errors.set(r.uid, e);
    else if ((counts.get(k) ?? 0) > 1) {
      errors.set(r.uid, t('varKeyDuplicate', k));
    }
  }
  return errors;
}

export function rowsToVariables(rows: readonly VariableRow[]): Variable[] {
  return rows.map((r) => ({
    ...r.extra,
    key: r.key.trim(),
    label: r.label.trim(),
    value: r.value,
    ...(r.scope === 'local' ? { scope: 'local' as const } : {}),
  }));
}

export interface VariableUse {
  ruleId: string;
  ruleName: string;
  /** Descrição curta dos campos da regra que usam a variável. */
  fields: string[];
}

function usesVariable(value: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_.])var\\.${escaped}(?![A-Za-z0-9_])`).test(value);
}

function describeField(f: Rule['fields'][number]): string {
  switch (f.locator.by) {
    case 'label':
      return f.locator.text;
    case 'selector':
      return f.locator.css;
    case 'name':
      return f.locator.name;
  }
}

/** Regras (e campos) cujo valor referencia `var.<key>`. */
export function variableUsage(key: string, rules: readonly Rule[]): VariableUse[] {
  if (key.trim() === '') return [];
  const uses: VariableUse[] = [];
  for (const rule of rules) {
    const fields = rule.fields.filter((f) => usesVariable(f.value, key.trim())).map(describeField);
    if (fields.length > 0) uses.push({ ruleId: rule.id, ruleName: rule.name, fields });
  }
  return uses;
}

/** Sugestões de valor para o autocomplete do campo Valor. */
export function valueSuggestions(variables: readonly Variable[]): { text: string; hint: string }[] {
  const vars = variables.map((v) => ({
    text: `{{ var.${v.key} }}`,
    hint: v.label !== '' ? t('hintVariableNamed', v.label) : t('hintVariable'),
  }));
  return [
    ...vars,
    { text: '{{ url.query.nome }}', hint: t('hintUrlParam') },
    { text: '{{ now | date("DD/MM/YYYY") }}', hint: t('hintToday') },
  ];
}
