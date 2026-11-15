import { getFilterDef } from './filters';
import { tokenizeBlock, type Token } from './tokenizer';
import {
  ExpressionError,
  type ArgNode,
  type ExprNode,
  type FilterCall,
  type Segment,
  type SourceNode,
} from './types';
import { t } from '../i18n';

class Cursor {
  private i = 0;
  constructor(
    private readonly tokens: Token[],
    /** Posição para reportar erro no fim da expressão. */
    readonly eof: number,
  ) {}
  peek(): Token | undefined {
    return this.tokens[this.i];
  }
  next(): Token | undefined {
    return this.tokens[this.i++];
  }
}

function describe(tk: Token | undefined): string {
  return tk ? `"${tk.value}"` : t('exEndOfExpression');
}

function expect(cur: Cursor, type: Token['type'], what: string): Token {
  const tk = cur.next();
  if (!tk || tk.type !== type) {
    throw new ExpressionError(t('exExpected', what, describe(tk)), tk ? tk.start : cur.eof);
  }
  return tk;
}

function parseArgs(cur: Cursor): ArgNode[] {
  const args: ArgNode[] = [];
  expect(cur, 'lparen', '"("');
  if (cur.peek()?.type === 'rparen') {
    cur.next();
    return args;
  }
  for (;;) {
    const tk = cur.next();
    if (!tk || (tk.type !== 'string' && tk.type !== 'number')) {
      throw new ExpressionError(t('exArgKind', describe(tk)), tk ? tk.start : cur.eof);
    }
    args.push(
      tk.type === 'string'
        ? { kind: 'string', value: tk.value, start: tk.start, end: tk.end }
        : { kind: 'number', value: Number(tk.value), start: tk.start, end: tk.end },
    );
    const sep = cur.next();
    if (sep?.type === 'rparen') return args;
    if (sep?.type !== 'comma') {
      throw new ExpressionError(
        `Esperado "," ou ")", encontrado ${describe(sep)}`,
        sep ? sep.start : cur.eof,
      );
    }
  }
}

function parseSource(cur: Cursor): SourceNode {
  const tk = cur.next();
  if (!tk) throw new ExpressionError(t('exEmpty'), cur.eof);
  if (tk.type === 'string') return { kind: 'literal', value: tk.value };
  if (tk.type !== 'ident') {
    throw new ExpressionError(t('exInvalidSource', describe(tk)), tk.start);
  }
  const readPath = (): string[] => {
    const parts: string[] = [];
    while (cur.peek()?.type === 'dot') {
      cur.next();
      parts.push(expect(cur, 'ident', t('exNameAfterDot')).value);
    }
    return parts;
  };
  const oneStringArg = (fn: string): string => {
    const args = parseArgs(cur);
    const a = args[0];
    if (args.length !== 1 || !a || a.kind !== 'string') {
      throw new ExpressionError(t('exFnNeedsText', fn), tk.start);
    }
    return String(a.value);
  };
  switch (tk.value) {
    case 'var': {
      const path = readPath();
      if (path.length === 0) throw new ExpressionError(t('exUseVar'), tk.start);
      return { kind: 'var', key: path.join('.') };
    }
    case 'url': {
      const path = readPath();
      const [first, ...rest] = path;
      if (first === 'query') {
        if (rest.length === 0) throw new ExpressionError(t('exUseUrlQuery'), tk.start);
        return { kind: 'urlQuery', name: rest.join('.') };
      }
      if (rest.length === 0 && first === 'path') return { kind: 'urlPath' };
      if (rest.length === 0 && first === 'host') return { kind: 'urlHost' };
      if (rest.length === 0 && first === 'href') return { kind: 'urlHref' };
      throw new ExpressionError(
        t('exUnknownUrlSource', `url${path.map((p) => '.' + p).join('')}`),
        tk.start,
      );
    }
    case 'now':
      if (cur.peek()?.type === 'dot') {
        throw new ExpressionError(t('exNowNoProps'), tk.start);
      }
      return { kind: 'now' };
    case 'field':
      return { kind: 'field', label: oneStringArg('field') };
    case 'text':
      return { kind: 'text', selector: oneStringArg('text') };
    default:
      throw new ExpressionError(t('exUnknownSource', tk.value), tk.start);
  }
}

function parseFilter(cur: Cursor): FilterCall {
  const nameTok = expect(cur, 'ident', t('exFilterName'));
  const def = getFilterDef(nameTok.value);
  if (!def) {
    throw new ExpressionError(`Filtro desconhecido: "${nameTok.value}"`, nameTok.start);
  }
  const args = cur.peek()?.type === 'lparen' ? parseArgs(cur) : [];
  const last = args[args.length - 1];
  const end = last ? last.end + 1 : nameTok.end;
  if (args.length < def.minArgs || args.length > def.args.length) {
    const exp =
      def.minArgs === def.args.length
        ? String(def.args.length)
        : `${def.minArgs} a ${def.args.length}`;
    throw new ExpressionError(
      `O filtro "${nameTok.value}" espera ${exp} argumento(s), recebeu ${args.length}`,
      nameTok.start,
    );
  }
  args.forEach((a, idx) => {
    const type = def.args[idx];
    if (type === 'string' && a.kind !== 'string') {
      throw new ExpressionError(
        `Argumento ${idx + 1} de "${nameTok.value}" deve ser texto entre aspas`,
        a.start,
      );
    }
    if (type === 'int' && (a.kind !== 'number' || !Number.isInteger(a.value))) {
      throw new ExpressionError(t('exArgInt', idx + 1, nameTok.value), a.start);
    }
    if (type === 'decimal' && (a.kind !== 'number' || !Number.isFinite(a.value))) {
      throw new ExpressionError(t('exArgNumber', idx + 1, nameTok.value), a.start);
    }
  });
  return { name: nameTok.value, args, start: nameTok.start, end };
}

/** Faz o parse do bloco que começa em `blockStart` (posição do `{{`). */
function parseBlock(template: string, blockStart: number): { node: ExprNode; end: number } {
  const { tokens, end } = tokenizeBlock(template, blockStart + 2, blockStart);
  const cur = new Cursor(tokens, end - 2);
  const source = parseSource(cur);
  const filters: FilterCall[] = [];
  while (cur.peek()) {
    const tk = cur.next();
    if (tk?.type !== 'pipe') {
      throw new ExpressionError(t('exExpectedPipe', describe(tk)), tk ? tk.start : cur.eof);
    }
    filters.push(parseFilter(cur));
  }
  const raw = template.slice(blockStart + 2, end - 2).trim();
  return { node: { source, filters, raw, start: blockStart }, end };
}

/** Divide o template em texto literal e expressões. Lança ExpressionError com posição absoluta. */
export function parseTemplate(template: string): Segment[] {
  const segments: Segment[] = [];
  let literal = '';
  let i = 0;
  while (i < template.length) {
    if (template.startsWith('\\{{', i)) {
      literal += '{{';
      i += 3;
    } else if (template.startsWith('{{', i)) {
      if (literal) segments.push({ kind: 'text', value: literal });
      literal = '';
      const { node, end } = parseBlock(template, i);
      segments.push({ kind: 'expr', node });
      i = end;
    } else {
      literal += template.charAt(i);
      i++;
    }
  }
  if (literal) segments.push({ kind: 'text', value: literal });
  return segments;
}

export function templateHasBlocks(template: string): boolean {
  let i = 0;
  while (i < template.length) {
    if (template.startsWith('\\{{', i)) i += 3;
    else if (template.startsWith('{{', i)) return true;
    else i++;
  }
  return false;
}
