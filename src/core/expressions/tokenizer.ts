import { ExpressionError } from './types';

export type TokenType =
  'ident' | 'dot' | 'pipe' | 'lparen' | 'rparen' | 'comma' | 'string' | 'number';

export interface Token {
  type: TokenType;
  /** Texto do identificador, conteúdo da string ou número como texto. */
  value: string;
  start: number;
  end: number;
}

const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_]/u;
const KEY_PART = /[\p{L}\p{N}_-]/u;

const SINGLE: Record<string, TokenType | undefined> = {
  '.': 'dot',
  '|': 'pipe',
  '(': 'lparen',
  ')': 'rparen',
  ',': 'comma',
};

export interface TokenizeResult {
  tokens: Token[];
  /** Posição logo após o `}}` de fechamento. */
  end: number;
}

function readString(src: string, start: number): Token {
  let j = start + 1;
  let out = '';
  while (j < src.length) {
    const ch = src.charAt(j);
    if (ch === '\\') {
      const nx = src.charAt(j + 1);
      if (nx === '"' || nx === '\\') {
        out += nx;
        j += 2;
      } else {
        // Escape desconhecido: mantém a barra (útil em padrões de regex, ex.: "\d+").
        out += ch;
        j++;
      }
    } else if (ch === '"') {
      return { type: 'string', value: out, start, end: j + 1 };
    } else {
      out += ch;
      j++;
    }
  }
  throw new ExpressionError('String sem aspas de fechamento', start);
}

/**
 * Tokeniza o interior de um bloco `{{ ... }}`. `from` aponta para o primeiro caractere depois
 * do `{{`. Para no primeiro `}}` fora de string literal.
 */
export function tokenizeBlock(src: string, from: number, blockStart: number): TokenizeResult {
  const tokens: Token[] = [];
  let i = from;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === '}' && src.charAt(i + 1) === '}') return { tokens, end: i + 2 };
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const afterDot = tokens[tokens.length - 1]?.type === 'dot';
    const singleType = SINGLE[c];
    if (singleType) {
      tokens.push({ type: singleType, value: c, start: i, end: i + 1 });
      i++;
    } else if (c === '"') {
      const t = readString(src, i);
      tokens.push(t);
      i = t.end;
    } else if (afterDot && KEY_PART.test(c)) {
      // Depois de um ponto, chaves aceitam hífen e podem começar por dígito (var.codigo-1).
      let j = i;
      while (j < src.length && KEY_PART.test(src.charAt(j))) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j), start: i, end: j });
      i = j;
    } else if (/\d/.test(c) || (c === '-' && /\d/.test(src.charAt(i + 1)))) {
      const m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
      const lit = m ? m[0] : c;
      tokens.push({ type: 'number', value: lit, start: i, end: i + lit.length });
      i += lit.length;
    } else if (IDENT_START.test(c)) {
      let j = i;
      while (j < src.length && IDENT_PART.test(src.charAt(j))) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j), start: i, end: j });
      i = j;
    } else {
      throw new ExpressionError(`Caractere inesperado "${c}"`, i);
    }
  }
  throw new ExpressionError('Bloco "{{" sem fechamento "}}"', blockStart);
}
