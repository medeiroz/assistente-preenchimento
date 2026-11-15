import { describe, expect, it } from 'vitest';
import {
  FILTER_NAMES,
  hasExpressions,
  resolveValue,
  validateTemplate,
  type ExpressionContext,
} from '@/core/expressions';

const NOW = new Date('2026-11-13T15:00:00Z'); // 13/11/2026 12:00 em America/Sao_Paulo

function makeCtx(over: Partial<ExpressionContext> = {}): ExpressionContext {
  return {
    variables: { codigo: 'ABC-123', vazio: '', nome: '  Maria Silva  ' },
    url: new URL('https://ce.example.com/vendas/relatorio?order_uuid=0a1b2c3d&x=1&x=2&e='),
    now: NOW,
    field: (label) => (label === 'CPF' ? '123.456.789-09' : label === 'Data' ? '25/01/2026' : null),
    text: (sel) => (sel === '.order-number' ? 'Pedido #4521' : null),
    ...over,
  };
}

function ok(template: string, over: Partial<ExpressionContext> = {}): string {
  const r = resolveValue(template, makeCtx(over));
  if (!r.ok) throw new Error(`esperado ok, veio erro: ${r.error}`);
  return r.value;
}

function err(template: string, over: Partial<ExpressionContext> = {}): string {
  const r = resolveValue(template, makeCtx(over));
  if (r.ok) throw new Error(`esperado erro, veio: ${r.value}`);
  return r.error;
}

describe('literais e blocos', () => {
  it('texto puro sai igual', () => {
    expect(ok('Olá, mundo')).toBe('Olá, mundo');
  });
  it('template vazio resolve para vazio', () => {
    expect(ok('')).toBe('');
  });
  it('um bloco simples', () => {
    expect(ok('{{ var.codigo }}')).toBe('ABC-123');
  });
  it('bloco sem espaços internos', () => {
    expect(ok('{{var.codigo}}')).toBe('ABC-123');
  });
  it('texto ao redor e múltiplos blocos', () => {
    expect(ok('NF {{ var.codigo }} / {{ url.query.order_uuid }}!')).toBe('NF ABC-123 / 0a1b2c3d!');
  });
  it('escape \\{{ produz {{ literal', () => {
    expect(ok('\\{{ var.codigo }}')).toBe('{{ var.codigo }}');
  });
  it('escape convive com bloco real', () => {
    expect(ok('\\{{ e {{ var.codigo }}')).toBe('{{ e ABC-123');
  });
  it('}} solto em texto literal passa', () => {
    expect(ok('a }} b')).toBe('a }} b');
  });
  it('}} dentro de string literal não fecha o bloco', () => {
    expect(ok('{{ "a}}b" }}')).toBe('a}}b');
  });
});

describe('fontes', () => {
  it('var.<chave>', () => {
    expect(ok('{{ var.codigo }}')).toBe('ABC-123');
  });
  it('url.query.<nome> devolve o primeiro valor', () => {
    expect(ok('{{ url.query.x }}')).toBe('1');
  });
  it('url.path, url.host e url.href', () => {
    expect(ok('{{ url.path }}')).toBe('/vendas/relatorio');
    expect(ok('{{ url.host }}')).toBe('ce.example.com');
    expect(ok('{{ url.href }}')).toContain('https://ce.example.com/vendas/relatorio?');
  });
  it('now formata como DD/MM/YYYY por padrão', () => {
    expect(ok('{{ now }}')).toBe('13/11/2026');
  });
  it('field("Rótulo")', () => {
    expect(ok('{{ field("CPF") }}')).toBe('123.456.789-09');
  });
  it('text("seletor")', () => {
    expect(ok('{{ text(".order-number") }}')).toBe('Pedido #4521');
  });
  it('literal string com escapes', () => {
    expect(ok('{{ "diz \\"oi\\" \\\\ ok" }}')).toBe('diz "oi" \\ ok');
  });
  it('field e text recebem o argumento exato', () => {
    const seen: string[] = [];
    ok('{{ field("A b") }}{{ text("div > p") }}', {
      field: (l) => (seen.push(l), 'x'),
      text: (s) => (seen.push(s), 'y'),
    });
    expect(seen).toEqual(['A b', 'div > p']);
  });
});

describe('filtros de texto', () => {
  it('upper, lower, trim', () => {
    expect(ok('{{ var.codigo | lower }}')).toBe('abc-123');
    expect(ok('{{ var.codigo | upper }}')).toBe('ABC-123');
    expect(ok('[{{ var.nome | trim }}]')).toBe('[Maria Silva]');
  });
  it('digits remove não dígitos', () => {
    expect(ok('{{ field("CPF") | digits }}')).toBe('12345678909');
  });
  it('replace troca todas as ocorrências', () => {
    expect(ok('{{ field("CPF") | replace(".", "") | replace("-", "") }}')).toBe('12345678909');
  });
  it('regex com grupo default 0 e grupo explícito', () => {
    expect(ok('{{ text(".order-number") | regex("\\d+") }}')).toBe('4521');
    expect(ok('{{ text(".order-number") | regex("#(\\d+)", 1) }}')).toBe('4521');
  });
  it('regex sem match ou grupo inexistente vira ausente', () => {
    expect(err('{{ var.codigo | regex("zzz") }}')).toContain('Valor ausente');
    expect(err('{{ var.codigo | regex("ABC", 3) }}')).toContain('Valor ausente');
  });
  it('regex inválido gera erro claro', () => {
    expect(err('{{ var.codigo | regex("(") }}')).toContain('Expressão regular inválida');
  });
  it('slice com um e dois argumentos', () => {
    expect(ok('{{ var.codigo | slice(4) }}')).toBe('123');
    expect(ok('{{ var.codigo | slice(0, 3) }}')).toBe('ABC');
    expect(ok('{{ var.codigo | slice(-3) }}')).toBe('123');
  });
  it('padStart', () => {
    expect(ok('{{ "7" | padStart(3, "0") }}')).toBe('007');
    expect(ok('{{ "7" | padStart(3) }}')).toBe('  7');
  });
  it('encadeamento de vários filtros', () => {
    expect(ok('{{ var.nome | trim | upper | replace(" ", "_") }}')).toBe('MARIA_SILVA');
  });
  it('filtro de texto aplicado a data usa DD/MM/YYYY', () => {
    expect(ok('{{ now | digits }}')).toBe('13112026');
  });
});

describe('ausência e default', () => {
  it('variável inexistente → erro Valor ausente com a expressão', () => {
    expect(err('{{ var.nao_existe }}')).toBe('Valor ausente: var.nao_existe');
  });
  it('variável vazia conta como ausente', () => {
    expect(err('{{ var.vazio }}')).toContain('Valor ausente');
  });
  it('field/text/query nulos ou vazios são ausentes', () => {
    expect(err('{{ field("Nada") }}')).toContain('Valor ausente');
    expect(err('{{ text(".nada") }}')).toContain('Valor ausente');
    expect(err('{{ url.query.e }}')).toContain('Valor ausente');
    expect(err('{{ url.query.naoha }}')).toContain('Valor ausente');
  });
  it('filtros propagam a ausência', () => {
    expect(err('{{ var.nao_existe | upper | trim | digits }}')).toContain('Valor ausente');
  });
  it('default no fim da cadeia', () => {
    expect(ok('{{ var.nao_existe | default("N/D") }}')).toBe('N/D');
  });
  it('default não altera valor presente', () => {
    expect(ok('{{ var.codigo | default("N/D") }}')).toBe('ABC-123');
  });
  it('default no meio da cadeia alimenta filtros seguintes', () => {
    expect(ok('{{ var.nao_existe | default("abc") | upper }}')).toBe('ABC');
  });
  it('default resolve ausência criada por regex sem match', () => {
    expect(ok('{{ var.codigo | regex("zzz") | default("sem") }}')).toBe('sem');
  });
  it('default em valor vazio por trim', () => {
    expect(ok('{{ "   " | trim | default("vazio") }}')).toBe('vazio');
  });
  it('erro de ausência em um bloco derruba o template todo', () => {
    expect(err('a {{ var.codigo }} b {{ var.nao_existe }}')).toBe('Valor ausente: var.nao_existe');
  });
});

describe('datas (America/Sao_Paulo)', () => {
  it('exemplo da arquitetura: endOfMonth', () => {
    expect(ok('{{ now | endOfMonth | date("DD/MM/YYYY") }}')).toBe('30/11/2026');
  });
  it('startOfMonth', () => {
    expect(ok('{{ now | startOfMonth | date("DD/MM/YYYY") }}')).toBe('01/11/2026');
  });
  it('date com todos os tokens', () => {
    expect(ok('{{ now | date("DD-MM-YYYY YY HH:mm") }}')).toBe('13-11-2026 26 12:00');
  });
  it('usa o fuso: 02:00Z ainda é o dia anterior em São Paulo', () => {
    const now = new Date('2026-11-13T02:30:00Z');
    expect(ok('{{ now | date("DD/MM/YYYY HH:mm") }}', { now })).toBe('12/11/2026 23:30');
  });
  it('timeZone configurável', () => {
    const now = new Date('2026-11-13T02:30:00Z');
    expect(ok('{{ now | date("DD/MM/YYYY") }}', { now, timeZone: 'UTC' })).toBe('13/11/2026');
  });
  it('fuso inválido gera erro', () => {
    expect(err('{{ now }}', { timeZone: 'Marte/Olimpo' })).toContain('Fuso horário inválido');
  });
  it('addDays cruzando o mês', () => {
    expect(ok('{{ now | addDays(20) }}')).toBe('03/12/2026');
  });
  it('addDays negativo', () => {
    expect(ok('{{ now | addDays(-13) }}')).toBe('31/10/2026');
  });
  it('addDays cruzando o ano (virada via fuso)', () => {
    const now = new Date('2027-01-01T01:00:00Z'); // 31/12/2026 22:00 em SP
    expect(ok('{{ now }}', { now })).toBe('31/12/2026');
    expect(ok('{{ now | addDays(1) }}', { now })).toBe('01/01/2027');
  });
  it('addMonths cruzando o ano', () => {
    expect(ok('{{ now | addMonths(2) }}')).toBe('13/01/2027');
    expect(ok('{{ now | addMonths(-11) }}')).toBe('13/12/2025');
  });
  it('addMonths limita o dia ao fim do mês de destino', () => {
    const now = new Date('2026-01-31T15:00:00Z');
    expect(ok('{{ now | addMonths(1) }}', { now })).toBe('28/02/2026');
  });
  it('endOfMonth em fevereiro de ano bissexto e não bissexto', () => {
    expect(ok('{{ now | endOfMonth }}', { now: new Date('2028-02-10T15:00:00Z') })).toBe(
      '29/02/2028',
    );
    expect(ok('{{ now | endOfMonth }}', { now: new Date('2027-02-10T15:00:00Z') })).toBe(
      '28/02/2027',
    );
  });
  it('endOfMonth de dezembro', () => {
    expect(ok('{{ now | addMonths(1) | endOfMonth }}')).toBe('31/12/2026');
  });
  it('texto DD/MM/YYYY como data', () => {
    expect(ok('{{ field("Data") | addDays(10) }}')).toBe('04/02/2026');
    expect(ok('{{ field("Data") | endOfMonth | date("YYYY-MM-DD") }}')).toBe('2026-01-31');
  });
  it('texto ISO como data', () => {
    expect(ok('{{ "2028-02-01" | endOfMonth }}')).toBe('29/02/2028');
    expect(ok('{{ "2026-12-31" | addDays(1) | date("DD/MM/YY") }}')).toBe('01/01/27');
  });
  it('texto não-data com filtro de data → erro claro', () => {
    const e = err('{{ var.codigo | addDays(1) }}');
    expect(e).toContain('não é uma data válida');
    expect(e).toContain('{{ var.codigo | addDays(1) }}');
  });
  it('data impossível é rejeitada', () => {
    expect(err('{{ "31/02/2026" | addDays(1) }}')).toContain('não é uma data válida');
  });
  it('ausente propaga por filtros de data', () => {
    expect(err('{{ var.nao_existe | addDays(1) }}')).toContain('Valor ausente');
  });
});

describe('erros de sintaxe e tipos', () => {
  it('bloco sem fechamento aponta a posição do {{', () => {
    const r = validateTemplate('abc {{ var.x');
    expect(r).toMatchObject({ ok: false, position: 4 });
    expect(err('abc {{ var.x')).toContain('sem fechamento');
  });
  it('string sem fechamento', () => {
    const r = validateTemplate('{{ "abc }}');
    expect(r).toMatchObject({ ok: false, position: 3 });
  });
  it('fonte desconhecida', () => {
    expect(err('{{ foo.bar }}')).toContain('Fonte desconhecida: "foo"');
    expect(err('{{ url.xyz }}')).toContain('Fonte desconhecida: "url.xyz"');
  });
  it('var sem chave e url.query sem nome', () => {
    expect(err('{{ var }}')).toContain('var.<chave>');
    expect(err('{{ url.query }}')).toContain('url.query.<nome>');
  });
  it('expressão vazia', () => {
    expect(err('{{ }}')).toContain('Expressão vazia');
  });
  it('filtro desconhecido', () => {
    const e = err('{{ var.codigo | explodir }}');
    expect(e).toContain('Filtro desconhecido: "explodir"');
  });
  it('filtro desconhecido tem posição no validateTemplate', () => {
    expect(validateTemplate('xx {{ var.a | nope }}')).toMatchObject({ ok: false, position: 14 });
  });
  it('aridade errada', () => {
    expect(err('{{ var.codigo | upper("x") }}')).toContain('espera 0 argumento(s), recebeu 1');
    expect(err('{{ var.codigo | replace("a") }}')).toContain('espera 2 argumento(s), recebeu 1');
    expect(err('{{ var.codigo | addDays }}')).toContain('espera 1 argumento(s), recebeu 0');
    expect(err('{{ var.codigo | slice(1,2,3) }}')).toContain('espera 1 a 2');
  });
  it('tipo de argumento errado', () => {
    expect(err('{{ now | addDays("1") }}')).toContain('número inteiro');
    expect(err('{{ now | addDays(1.5) }}')).toContain('número inteiro');
    expect(err('{{ var.codigo | replace(1, 2) }}')).toContain('texto entre aspas');
  });
  it('filtros sem parênteses e com parênteses vazios são equivalentes', () => {
    expect(ok('{{ var.codigo | upper() }}')).toBe('ABC-123');
  });
  it('caractere inesperado', () => {
    expect(validateTemplate('{{ var.a # }}')).toMatchObject({ ok: false, position: 9 });
  });
  it('falta de pipe entre filtros', () => {
    expect(err('{{ var.a upper }}')).toContain('Esperado "|"');
  });
  it('now com propriedade', () => {
    expect(err('{{ now.year }}')).toContain('"now" não tem propriedades');
  });
  it('mensagem de erro de resolução inclui posição para erros de sintaxe', () => {
    expect(err('ab {{ ? }}')).toContain('posição 6');
  });
});

describe('segurança', () => {
  it('var.__proto__ e var.constructor são ausentes', () => {
    expect(err('{{ var.__proto__ }}')).toContain('Valor ausente');
    expect(err('{{ var.constructor }}')).toContain('Valor ausente');
    expect(err('{{ var.toString }}')).toContain('Valor ausente');
    expect(err('{{ var.hasOwnProperty }}')).toContain('Valor ausente');
  });
  it('default ainda funciona sobre chaves de protótipo', () => {
    expect(ok('{{ var.__proto__ | default("seguro") }}')).toBe('seguro');
  });
  it('filtro com nome de protótipo é desconhecido', () => {
    expect(err('{{ var.codigo | constructor }}')).toContain('Filtro desconhecido');
    expect(err('{{ var.codigo | toString }}')).toContain('Filtro desconhecido');
  });
});

describe('validateTemplate, hasExpressions e FILTER_NAMES', () => {
  it('validateTemplate aceita templates válidos', () => {
    expect(validateTemplate('x {{ now | endOfMonth | date("DD/MM/YYYY") }} y')).toEqual({
      ok: true,
    });
    expect(validateTemplate('literal')).toEqual({ ok: true });
    expect(validateTemplate('\\{{ nada')).toEqual({ ok: true });
  });
  it('validateTemplate não precisa de contexto nem acessa fontes', () => {
    expect(validateTemplate('{{ field("Inexistente") | digits }}')).toEqual({ ok: true });
  });
  it('hasExpressions', () => {
    expect(hasExpressions('abc')).toBe(false);
    expect(hasExpressions('a {{ var.x }}')).toBe(true);
    expect(hasExpressions('\\{{ var.x }}')).toBe(false);
    expect(hasExpressions('\\{{ a }} {{ b }}')).toBe(true);
    expect(hasExpressions('')).toBe(false);
  });
  it('FILTER_NAMES lista todos os filtros', () => {
    expect([...FILTER_NAMES].sort()).toEqual(
      [
        'addDays',
        'addMonths',
        'add',
        'date',
        'default',
        'digits',
        'endOfMonth',
        'div',
        'ifEmpty',
        'lower',
        'map',
        'money',
        'mul',
        'number',
        'padStart',
        'regex',
        'replace',
        'round',
        'slice',
        'startOfMonth',
        'sub',
        'trim',
        'upper',
        'when',
      ].sort(),
    );
  });
});
