export type FieldOutcome =
  | 'filled'
  | 'skipped-not-default'
  | 'skipped-already-handled'
  | 'skipped-disabled'
  | 'skipped-unresolved-value'
  | 'not-found'
  | 'undone'
  | 'error';

export type FieldReport = {
  fieldId: string;
  description: string;
  outcome: FieldOutcome;
  previousValue: string | null;
  newValue?: string;
  message?: string;
};

export type RunReport = {
  ruleId: string;
  ruleName: string;
  startedAt: string;
  url: string;
  origin: 'auto' | 'manual';
  fields: FieldReport[];
};

export function summarize(r: RunReport): {
  filled: number;
  undone: number;
  skipped: number;
  notFound: number;
  errors: number;
} {
  const out = { filled: 0, undone: 0, skipped: 0, notFound: 0, errors: 0 };
  for (const f of r.fields) {
    if (f.outcome === 'filled') out.filled++;
    else if (f.outcome === 'undone') out.undone++;
    else if (f.outcome === 'not-found') out.notFound++;
    else if (f.outcome === 'error') out.errors++;
    else out.skipped++;
  }
  return out;
}
