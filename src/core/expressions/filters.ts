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

type ArgType = 'string' | 'int';
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
  return v.kind === 'text' ? v.text : formatDate(v.date, DEFAULT_DATE_FORMAT);
}

function asDate(v: Present): LocalDateTime {
  if (v.kind === 'date') return v.date;
  const parsed = parseDateText(v.text);
  if (!parsed) {
    throw new ExpressionError(
      `"${v.text}" não é uma data válida (use AAAA-MM-DD ou DD/MM/AAAA)`,
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
  if (input === null) return null;
  return def.run(input, args);
}
