import { describe, expect, it } from 'vitest';
import { resolveValue, validateTemplate, type ExpressionContext } from '@/core/expressions';

function makeCtx(vars: Record<string, string> = {}): ExpressionContext {
  return {
    variables: vars,
    url: new URL('https://ce.example.com/x'),
    now: new Date('2026-11-13T15:00:00Z'),
    field: (label) => (label === 'Qtd' ? '4' : null),
    text: () => null,
  };
}

function ok(template: string, vars: Record<string, string> = {}): string {
  const r = resolveValue(template, makeCtx(vars));
  if (!r.ok) throw new Error(`esperado ok, veio erro: ${r.error}`);
  return r.value;
}

function err(template: string, vars: Record<string, string> = {}): string {
  const r = resolveValue(template, makeCtx(vars));
  if (r.ok) throw new Error(`esperado erro, veio: ${r.value}`);
  return r.error;
}

const n = (input: string, filters: string): string => ok(`{{ "${input}" | ${filters} }}`);

describe('when', () => {
  it('igual → então', () => {
    expect(ok('{{ var.s | when("A", "Sim", "Não") }}', { s: 'A' })).toBe('Sim');
  });
  it('diferente → senão', () => {
    expect(ok('{{ var.s | when("A", "Sim", "Não") }}', { s: 'B' })).toBe('Não');
  });
  it('sem senão devolve a própria entrada', () => {
    expect(ok('{{ var.s | when("A", "Sim") }}', { s: 'B' })).toBe('B');
  });
  it('comparação é exata (diferencia maiúsculas)', () => {
    expect(ok('{{ var.s | when("a", "Sim", "Não") }}', { s: 'A' })).toBe('Não');
  });
  it('argumentos faltando dão erro de validação com posição', () => {
    const v = validateTemplate('{{ var.s | when("A") }}');
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error).toContain('"when" espera 2 a 3');
      expect(v.position).toBe(11);
    }
  });
  it('argumento numérico onde se espera texto é erro', () => {
    expect(validateTemplate('{{ var.s | when(1, "x") }}').ok).toBe(false);
  });
});

describe('ifEmpty', () => {
  it('ausente → padrão', () => {
    expect(ok('{{ var.nada | ifEmpty("-") }}')).toBe('-');
  });
  it('vazio → padrão', () => {
    expect(ok('{{ var.v | ifEmpty("-") }}', { v: '' })).toBe('-');
  });
  it('só espaços → padrão', () => {
    expect(ok('{{ var.v | ifEmpty("-") }}', { v: '   ' })).toBe('-');
  });
  it('preenchido passa direto', () => {
    expect(ok('{{ var.v | ifEmpty("-") }}', { v: ' a ' })).toBe(' a ');
  });
  it('sem argumento é erro de validação', () => {
    expect(validateTemplate('{{ var.v | ifEmpty }}').ok).toBe(false);
  });
});

describe('map', () => {
  const t = '{{ var.s | map("A=1; B = 2 ;C=três", "?") }}';
  it('chave encontrada', () => {
    expect(ok(t, { s: 'B' })).toBe('2');
    expect(ok(t, { s: 'C' })).toBe('três');
  });
  it('sem correspondência usa o padrão', () => {
    expect(ok(t, { s: 'Z' })).toBe('?');
  });
  it('sem correspondência e sem padrão não resolve', () => {
    expect(err('{{ var.s | map("A=1;B=2") }}', { s: 'Z' })).toContain('Valor ausente');
  });
  it('ignora pares malformados', () => {
    expect(ok('{{ var.s | map("lixo;A=1") }}', { s: 'A' })).toBe('1');
  });
  it('sem argumentos é erro de validação', () => {
    expect(validateTemplate('{{ var.s | map }}').ok).toBe(false);
  });
});

describe('aritmética', () => {
  it('add / sub / mul / div', () => {
    expect(n('10', 'add(5)')).toBe('15');
    expect(n('10', 'sub(2.5)')).toBe('7.5');
    expect(n('10', 'mul(3)')).toBe('30');
    expect(n('10', 'div(4)')).toBe('2.5');
  });
  it('aceita decimais e negativos nos argumentos', () => {
    expect(n('1', 'add(-0.5)')).toBe('0.5');
    expect(n('1', 'mul(-2)')).toBe('-2');
  });
  it('sem ruído de ponto flutuante', () => {
    expect(n('0.1', 'add(0.2)')).toBe('0.3');
  });
  it('entrada negativa', () => {
    expect(n('-5', 'add(2)')).toBe('-3');
    expect(n('-5,5', 'mul(2)')).toBe('-11');
  });
  it('divisão por zero não resolve', () => {
    expect(err('{{ "10" | div(0) }}')).toContain('Valor ausente');
  });
  it('entrada não numérica não resolve', () => {
    expect(err('{{ "abc" | add(1) }}')).toContain('Valor ausente');
    expect(err('{{ "1,2,3" | add(1) }}')).toContain('Valor ausente');
    expect(err('{{ "1.2.3" | add(1) }}')).toContain('Valor ausente');
  });
  it('resultado não finito não resolve', () => {
    const big = '1' + '0'.repeat(300);
    expect(err(`{{ "${big}" | mul(${big}) }}`)).toContain('Valor ausente');
  });
  it('argumento não numérico é erro de validação com posição', () => {
    const v = validateTemplate('{{ "1" | add("x") }}');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.position).toBe(13);
  });
  it('argumento faltando é erro de validação', () => {
    expect(validateTemplate('{{ "1" | add }}').ok).toBe(false);
  });
  it('notação simples para números grandes', () => {
    expect(n('1000000', 'mul(1000000)')).toBe('1000000000000');
  });
});

describe('interpretação de números', () => {
  it('pt-BR com milhar e vírgula', () => {
    expect(n('1.234,56', 'add(0)')).toBe('1234.56');
  });
  it('vírgula decimal sem milhar', () => {
    expect(n('1234,56', 'add(0)')).toBe('1234.56');
  });
  it('ponto decimal', () => {
    expect(n('1234.56', 'add(0)')).toBe('1234.56');
    expect(n('1.5', 'add(0)')).toBe('1.5');
  });
  it('1.234 é milhar', () => {
    expect(n('1.234', 'add(0)')).toBe('1234');
  });
  it('1.234,5 usa vírgula como decimal', () => {
    expect(n('1.234,5', 'add(0)')).toBe('1234.5');
  });
  it('0.123 é decimal; 1.234.567 é milhar', () => {
    expect(n('0.123', 'add(0)')).toBe('0.123');
    expect(n('1.234.567', 'add(0)')).toBe('1234567');
  });
  it('prefixo R$ e espaços', () => {
    expect(n('R$ 1.234,56', 'add(0)')).toBe('1234.56');
    expect(n(' R$1.234,56 ', 'add(0)')).toBe('1234.56');
    expect(n('R$ -10,5', 'add(0)')).toBe('-10.5');
  });
});

describe('round', () => {
  it('padrão 0 casas, meio para longe de zero', () => {
    expect(n('2.5', 'round')).toBe('3');
    expect(n('-2.5', 'round')).toBe('-3');
    expect(n('2.4', 'round()')).toBe('2');
  });
  it('1.005 com 2 casas → 1.01 (valor calculado, sem a regra de milhar)', () => {
    expect(n('1', 'add(0.005) | round(2)')).toBe('1.01');
    expect(n('1,005', 'round(2)')).toBe('1.01');
  });
  it('literal 1.005 segue a regra de milhar', () => {
    expect(n('1.005', 'round(2)')).toBe('1005');
  });
  it('-1,005 com 2 casas → -1.01', () => {
    expect(n('-1,005', 'round(2)')).toBe('-1.01');
  });
  it('não completa zeros', () => {
    expect(n('3', 'round(2)')).toBe('3');
  });
  it('casas fora do intervalo não resolve com erro', () => {
    expect(err('{{ "1" | round(25) }}')).toContain('casas decimais');
  });
  it('casas não inteiras é erro de validação', () => {
    expect(validateTemplate('{{ "1" | round(1.5) }}').ok).toBe(false);
  });
  it('entrada inválida não resolve', () => {
    expect(err('{{ "x" | round(2) }}')).toContain('Valor ausente');
  });
});

describe('number e money', () => {
  it('number padrão 2 casas', () => {
    expect(n('1234.5', 'number')).toBe('1.234,50');
  });
  it('number com casas', () => {
    expect(n('1234.5678', 'number(1)')).toBe('1.234,6');
    expect(n('1234.5', 'number(0)')).toBe('1.235');
  });
  it('number negativo e zero negativo', () => {
    expect(n('-1234.5', 'number')).toBe('-1.234,50');
    expect(n('-0', 'number')).toBe('0,00');
  });
  it('money', () => {
    expect(n('1234.56', 'money')).toBe('R$ 1.234,56');
    expect(n('1234.56', 'money')).not.toContain(' ');
  });
  it('money de entrada pt-BR', () => {
    expect(n('R$ 1.234,5', 'money')).toBe('R$ 1.234,50');
  });
  it('entrada inválida não resolve', () => {
    expect(err('{{ "abc" | money }}')).toContain('Valor ausente');
    expect(err('{{ "abc" | number }}')).toContain('Valor ausente');
  });
});

describe('encadeamento', () => {
  it('resultado numérico não é reinterpretado como milhar', () => {
    expect(n('1', 'add(0.234)')).toBe('1.234');
    expect(n('1', 'add(0.234) | add(1)')).toBe('2.234');
  });
  it('var.preco | add(10) | money', () => {
    expect(ok('{{ var.preco | add(10) | money }}', { preco: '1.234,56' })).toBe('R$ 1.244,56');
  });
  it('field | mul | round | number', () => {
    expect(ok('{{ field("Qtd") | mul(2.5) | round(2) | number(2) }}')).toBe('10,00');
  });
  it('saída formatada pode voltar para aritmética', () => {
    expect(ok('{{ "1234.5" | number | add(1) }}')).toBe('1235.5');
  });
  it('ifEmpty seguido de aritmética', () => {
    expect(ok('{{ var.v | ifEmpty("0") | add(1) }}', { v: ' ' })).toBe('1');
  });
  it('map seguido de money', () => {
    expect(ok('{{ var.p | map("A=10;B=20") | money }}', { p: 'B' })).toBe('R$ 20,00');
  });
});
