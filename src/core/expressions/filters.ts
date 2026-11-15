import {
  addDays,
  addMonths,
  DEFAULT_DATE_FORMAT,
  endOfMonth,
  formatDate,
  parseDateText,
  startOfMonth,
} from './dates';
import { ExpressionError, type LocalDateTime, type Value } from './types';

type ArgType = 'string' | 'int' | 'decimal';
type ArgValue = string | number;
type Present = NonNullable<Value>;

interface FilterDef {
  /** Tipos dos argumentos; os que vêm depois de `minArgs` são opcionais. */
  args: readonly ArgType[];
  minArgs: number;
  /** Executado apenas com valor presente. */
  run(input: Present, args: ArgValue[]): Value;
}

/** Texto vazio equivale a ausente. */
function text(s: string): Value {
  return s === '' ? null : { kind: 'text', text: s };
}

export function valueToText(v: Present): string {
  if (v.kind === 'text') return v.text;
  if (v.kind === 'number') return formatPlain(v.n);
  return formatDate(v.date, DEFAULT_DATE_FORMAT);
}

function asNumber(v: Present): number | null {
  return v.kind === 'number' ? v.n : parseNumber(valueToText(v));
}

function numValue(n: number): Value {
  return Number.isFinite(n) ? { kind: 'number', n: n === 0 ? 0 : Number(n.toPrecision(12)) } : null;
}

function numFilter(
  args: readonly ArgType[],
  minArgs: number,
  fn: (n: number, a: ArgValue[]) => number,
): FilterDef {
  return {
    args,
    minArgs,
    run: (input, a) => {
      const n = asNumber(input);
      return n === null ? null : numValue(fn(n, a));
    },
  };
}

function textNumFilter(
  args: readonly ArgType[],
  minArgs: number,
  fn: (n: number, a: ArgValue[]) => string,
): FilterDef {
  return {
    args,
    minArgs,
    run: (input, a) => {
      const n = asNumber(input);
      return n === null ? null : text(fn(n, a));
    },
  };
}

function asDate(v: Present): LocalDateTime {
  if (v.kind === 'date') return v.date;
  const parsed = parseDateText(valueToText(v));
  if (!parsed) {
    throw new ExpressionError(
      `"${valueToText(v)}" não é uma data válida (use AAAA-MM-DD ou DD/MM/AAAA)`,
      0,
    );
  }
  return parsed;
}

function textFilter(
  args: readonly ArgType[],
  minArgs: number,
  fn: (s: string, a: ArgValue[]) => string | null,
): FilterDef {
  return {
    args,
    minArgs,
    run: (input, a) => {
      const r = fn(valueToText(input), a);
      return r === null ? null : text(r);
    },
  };
}

function dateFilter(
  args: readonly ArgType[],
  minArgs: number,
  fn: (d: LocalDateTime, a: ArgValue[]) => Value,
): FilterDef {
  return { args, minArgs, run: (input, a) => fn(asDate(input), a) };
}

function compileRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    throw new ExpressionError(`Expressão regular inválida: "${pattern}"`, 0);
  }
}

/**
 * Converte texto em número aceitando pt-BR (`1.234,56`), ponto decimal (`1234.56`), `R$`,
 * espaços e sinal. Ambiguidade: com vírgula, a vírgula é decimal e os pontos são milhar; sem
 * vírgula, um ponto seguido de exatamente 3 dígitos (`1.234`) é milhar, salvo parte inteira
 * `0` (`0.123` é decimal); demais casos com ponto são decimais. Retorna null se inválido.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/R\$/gi, '').replace(/\s/g, '');
  const m = /^([+-]?)([\d.,]+)$/.exec(s);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const body = m[2] ?? '';
  let canon: string;
  if (body.includes(',')) {
    if (body.split(',').length > 2) return null;
    canon = body.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = body.split('.').length - 1;
    if (dots === 0) canon = body;
    else if (dots === 1) {
      canon = /^[1-9]\d*\.\d{3}$/.test(body) ? body.replace('.', '') : body;
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(body)) return null;
      canon = body.replace(/\./g, '');
    }
  }
  if (!/^\d+(\.\d+)?$/.test(canon)) return null;
  const n = Number(canon) * sign;
  return Number.isFinite(n) ? n : null;
}

/** Número em notação simples (sem expoente), sem ruído de ponto flutuante nem zeros supérfluos. */
function formatPlain(n: number): string {
  if (n === 0) return '0';
  return Number(n.toPrecision(12)).toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
}

function checkPlaces(places: number): number {
  if (!Number.isInteger(places) || places < 0 || places > 20) {
    throw new ExpressionError('O número de casas decimais deve estar entre 0 e 20', 0);
  }
  return places;
}

/** Arredonda "meio para longe de zero", sem erros de ponto flutuante (1.005 → 1.01). */
function roundHalfAway(n: number, places: number): number {
  const abs = formatPlain(Math.abs(n));
  const shifted = Math.round(Number(`${abs}e${places}`));
  const r = Number(`${shifted}e-${places}`);
  return n < 0 ? -r : r;
}

function arith(fn: (a: number, b: number) => number): FilterDef {
  return numFilter(['decimal'], 1, (a, [arg]) => fn(a, Number(arg)));
}

function formatBr(n: number, places: number, currency: boolean): string {
  const opts: Intl.NumberFormatOptions = currency
    ? { style: 'currency', currency: 'BRL' }
    : { minimumFractionDigits: places, maximumFractionDigits: places };
  return new Intl.NumberFormat('pt-BR', opts).format(n === 0 ? 0 : n).replace(/\u00a0/g, ' ');
}

const FILTERS: Record<string, FilterDef> = {
  upper: textFilter([], 0, (s) => s.toUpperCase()),
  lower: textFilter([], 0, (s) => s.toLowerCase()),
  trim: textFilter([], 0, (s) => s.trim()),
  digits: textFilter([], 0, (s) => s.replace(/\D/g, '')),
  replace: textFilter(['string', 'string'], 2, (s, [from, to]) =>
    s.split(String(from)).join(String(to)),
  ),
  regex: textFilter(['string', 'int'], 1, (s, [pattern, group]) => {
    const match = compileRegex(String(pattern)).exec(s);
    if (!match) return null;
    return match[Number(group ?? 0)] ?? null;
  }),
  slice: textFilter(['int', 'int'], 1, (s, [from, to]) =>
    s.slice(Number(from), to === undefined ? undefined : Number(to)),
  ),
  padStart: textFilter(['int', 'string'], 1, (s, [n, c]) =>
    s.padStart(Number(n), c === undefined ? ' ' : String(c)),
  ),
  // O tratamento de ausência do default é feito em applyFilter; valor presente passa direto.
  default: { args: ['string'], minArgs: 1, run: (input) => input },
  when: textFilter(['string', 'string', 'string'], 2, (s, [value, then, otherwise]) =>
    s === String(value) ? String(then) : otherwise === undefined ? s : String(otherwise),
  ),
  // Ausência/vazio tratados em applyFilter; valor não vazio passa direto.
  ifEmpty: { args: ['string'], minArgs: 1, run: (input) => input },
  map: textFilter(['string', 'string'], 1, (s, [table, fallback]) => {
    for (const pair of String(table).split(';')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      if (pair.slice(0, eq).trim() === s) return pair.slice(eq + 1).trim();
    }
    return fallback === undefined ? null : String(fallback);
  }),
  add: arith((a, b) => a + b),
  sub: arith((a, b) => a - b),
  mul: arith((a, b) => a * b),
  div: arith((a, b) => (b === 0 ? NaN : a / b)),
  round: numFilter(['int'], 0, (n, [places]) => roundHalfAway(n, checkPlaces(Number(places ?? 0)))),
  number: textNumFilter(['int'], 0, (n, [places]) =>
    formatBr(n, checkPlaces(Number(places ?? 2)), false),
  ),
  money: textNumFilter([], 0, (n) => formatBr(n, 2, true)),
  addDays: dateFilter(['int'], 1, (d, [n]) => ({ kind: 'date', date: addDays(d, Number(n)) })),
  addMonths: dateFilter(['int'], 1, (d, [n]) => ({ kind: 'date', date: addMonths(d, Number(n)) })),
  startOfMonth: dateFilter([], 0, (d) => ({ kind: 'date', date: startOfMonth(d) })),
  endOfMonth: dateFilter([], 0, (d) => ({ kind: 'date', date: endOfMonth(d) })),
  date: dateFilter(['string'], 1, (d, [fmt]) => text(formatDate(d, String(fmt)))),
};

export const FILTER_NAMES: readonly string[] = Object.freeze(Object.keys(FILTERS));

export function getFilterDef(name: string): { args: readonly ArgType[]; minArgs: number } | null {
  return Object.hasOwn(FILTERS, name) ? (FILTERS[name] ?? null) : null;
}

export function applyFilter(name: string, input: Value, args: ArgValue[]): Value {
  const def = Object.hasOwn(FILTERS, name) ? FILTERS[name] : undefined;
  if (!def) throw new ExpressionError(`Filtro desconhecido: "${name}"`, 0);
  if (name === 'default') return input ?? text(String(args[0]));
  if (name === 'ifEmpty') {
    return input === null || valueToText(input).trim() === '' ? text(String(args[0])) : input;
  }
  if (input === null) return null;
  return def.run(input, args);
}
