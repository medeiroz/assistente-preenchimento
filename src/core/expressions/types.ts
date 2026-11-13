export interface ExpressionContext {
  variables: Record<string, string>;
  url: URL;
  now: Date;
  /** Valor de outro campo pelo rótulo (injetado pelo runner). */
  field(label: string): string | null;
  /** Texto de um elemento da página (injetado pelo runner). */
  text(selector: string): string | null;
  /** Fuso horário IANA. Padrão: 'America/Sao_Paulo'. */
  timeZone?: string;
}

export type ResolveResult = { ok: true; value: string } | { ok: false; error: string };

export type ValidateResult = { ok: true } | { ok: false; error: string; position: number };

export interface ArgNode {
  kind: 'string' | 'number';
  value: string | number;
  start: number;
  end: number;
}

export type SourceNode =
  | { kind: 'var'; key: string }
  | { kind: 'urlQuery'; name: string }
  | { kind: 'urlPath' }
  | { kind: 'urlHost' }
  | { kind: 'urlHref' }
  | { kind: 'now' }
  | { kind: 'field'; label: string }
  | { kind: 'text'; selector: string }
  | { kind: 'literal'; value: string };

export interface FilterCall {
  name: string;
  args: ArgNode[];
  start: number;
  end: number;
}

export interface ExprNode {
  source: SourceNode;
  filters: FilterCall[];
  /** Trecho original da expressão (sem as chaves), com espaços aparados. */
  raw: string;
  /** Posição do `{{` no template. */
  start: number;
}

export type Segment = { kind: 'text'; value: string } | { kind: 'expr'; node: ExprNode };

/** Data/hora de parede (já no fuso desejado). `m` é 1-12. */
export interface LocalDateTime {
  y: number;
  m: number;
  d: number;
  H: number;
  mi: number;
}

/** Valor em avaliação. `null` = ausente. */
export type Value = null | { kind: 'text'; text: string } | { kind: 'date'; date: LocalDateTime };

export class ExpressionError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}
