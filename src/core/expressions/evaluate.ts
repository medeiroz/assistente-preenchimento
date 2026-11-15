import { DEFAULT_TIME_ZONE, toLocalDateTime } from './dates';
import { applyFilter, valueToText } from './filters';
import { parseTemplate } from './parser';
import {
  ExpressionError,
  type ExprNode,
  type ExpressionContext,
  type ResolveResult,
  type Segment,
  type SourceNode,
  type Value,
} from './types';
import { t } from '../i18n';

function fromString(s: string | null | undefined): Value {
  return s === null || s === undefined || s === '' ? null : { kind: 'text', text: s };
}

function evalSource(source: SourceNode, ctx: ExpressionContext): Value {
  switch (source.kind) {
    case 'var':
      // Object.hasOwn evita acesso a __proto__, constructor e afins.
      return Object.hasOwn(ctx.variables, source.key)
        ? fromString(ctx.variables[source.key])
        : null;
    case 'urlQuery':
      return fromString(ctx.url.searchParams.get(source.name));
    case 'urlPath':
      return fromString(ctx.url.pathname);
    case 'urlHost':
      return fromString(ctx.url.host);
    case 'urlHref':
      return fromString(ctx.url.href);
    case 'now':
      return { kind: 'date', date: toLocalDateTime(ctx.now, ctx.timeZone ?? DEFAULT_TIME_ZONE) };
    case 'field':
      return fromString(ctx.field(source.label));
    case 'text':
      return fromString(ctx.text(source.selector));
    case 'literal':
      return fromString(source.value);
  }
}

function evaluateNode(node: ExprNode, ctx: ExpressionContext): string {
  let value: Value;
  try {
    value = evalSource(node.source, ctx);
    for (const f of node.filters) {
      value = applyFilter(
        f.name,
        value,
        f.args.map((a) => a.value),
      );
    }
  } catch (e) {
    if (e instanceof ExpressionError) {
      throw new ExpressionError(t('exInExpression', e.message, node.raw), node.start);
    }
    throw e;
  }
  if (value === null) {
    throw new ExpressionError(t('exMissingValue', node.raw), node.start);
  }
  return valueToText(value);
}

export function resolveTemplate(template: string, ctx: ExpressionContext): ResolveResult {
  let segments: Segment[];
  try {
    segments = parseTemplate(template);
  } catch (e) {
    if (e instanceof ExpressionError) {
      return { ok: false, error: t('exWithPosition', e.message, e.position) };
    }
    throw e;
  }
  try {
    let out = '';
    for (const seg of segments) {
      out += seg.kind === 'text' ? seg.value : evaluateNode(seg.node, ctx);
    }
    return { ok: true, value: out };
  } catch (e) {
    if (e instanceof ExpressionError) return { ok: false, error: e.message };
    throw e;
  }
}
