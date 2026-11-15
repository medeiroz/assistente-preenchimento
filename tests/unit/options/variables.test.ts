import { describe, expect, it } from 'vitest';
import { parseRule, type Rule } from '../../../src/core/model';
import {
  keyError,
  rowsToVariables,
  validateVariableRows,
  valueSuggestions,
  variableUsage,
  type VariableRow,
} from '../../../src/entrypoints/options/composables/variables';

function rule(id: string, name: string, fields: Record<string, string>): Rule {
  const r = parseRule({
    id,
    name,
    trigger: { urlPatterns: ['https://a.com/*'] },
    fields: Object.entries(fields).map(([label, value]) => ({
      id: label.toLowerCase(),
      locator: { by: 'label', text: label },
      value,
    })),
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

const row = (uid: number, key: string, value = ''): VariableRow => ({
  scope: 'sync',
  uid,
  key,
  label: '',
  value,
});

describe('keyError', () => {
  it('aceita chaves válidas', () => {
    for (const k of ['a', 'codigo_teste', 'x1_y2']) expect(keyError(k)).toBeNull();
  });
  it('recusa vazia, maiúsculas, espaços, acentos e começo por número/_', () => {
    expect(keyError('')).toMatch(/Informe/);
    for (const k of ['Código Teste', 'Abc', 'a b', 'código', '1abc', '_abc', 'a-b']) {
      expect(keyError(k)).toMatch(/Chave inválida/);
    }
  });
});

describe('validateVariableRows', () => {
  it('marca chaves repetidas e inválidas', () => {
    const errs = validateVariableRows([row(1, 'a'), row(2, 'a'), row(3, 'B'), row(4, 'ok')]);
    expect([...errs.keys()]).toEqual([1, 2, 3]);
    expect(errs.get(1)).toMatch(/únicas/);
    expect(errs.get(3)).toMatch(/inválida/);
  });
  it('sem erros devolve mapa vazio', () => {
    expect(validateVariableRows([row(1, 'a'), row(2, 'b')]).size).toBe(0);
  });
});

describe('rowsToVariables', () => {
  it('apara chave e nome, preserva o valor', () => {
    expect(
      rowsToVariables([{ uid: 1, key: ' a ', label: ' Nome ', value: ' v ', scope: 'sync' }]),
    ).toEqual([{ key: 'a', label: 'Nome', value: ' v ' }]);
  });
});

describe('rowsToVariables (escopo)', () => {
  it('local grava scope local; sync não grava a chave scope', () => {
    expect(
      rowsToVariables([
        { uid: 1, key: 'a', label: '', value: 'x', scope: 'local' },
        { uid: 2, key: 'b', label: '', value: 'y', scope: 'sync' },
      ]),
    ).toEqual([
      { key: 'a', label: '', value: 'x', scope: 'local' },
      { key: 'b', label: '', value: 'y' },
    ]);
  });
});

describe('variableUsage', () => {
  const rules = [
    rule('r1', 'Regra 1', { NBS: '{{ var.codigo }}', Outro: 'fixo' }),
    rule('r2', 'Regra 2', { A: '{{var.codigo_teste | upper}}', B: 'x{{ var.codigo }}y' }),
    rule('r3', 'Regra 3', { C: '{{ url.query.var.codigo }}' }),
  ];
  it('acha usos exatos e lista campos', () => {
    expect(variableUsage('codigo', rules)).toEqual([
      { ruleId: 'r1', ruleName: 'Regra 1', fields: ['NBS'] },
      { ruleId: 'r2', ruleName: 'Regra 2', fields: ['B'] },
    ]);
  });
  it('não confunde prefixo de outra chave', () => {
    expect(variableUsage('codigo_teste', rules).map((u) => u.ruleId)).toEqual(['r2']);
    expect(variableUsage('cod', rules)).toEqual([]);
  });
  it('chave vazia não tem uso', () => {
    expect(variableUsage('', rules)).toEqual([]);
  });
});

describe('valueSuggestions', () => {
  it('inclui variáveis e exemplos de fontes', () => {
    const s = valueSuggestions([{ key: 'k', label: 'Nome', value: 'v' }]).map((x) => x.text);
    expect(s[0]).toBe('{{ var.k }}');
    expect(s).toContain('{{ url.query.nome }}');
    expect(s).toContain('{{ now | date("DD/MM/YYYY") }}');
  });
});
