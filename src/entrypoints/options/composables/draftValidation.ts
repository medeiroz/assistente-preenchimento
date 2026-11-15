import { parseRule, type Rule } from '../../../core/model';
import { validateTemplate } from '../../../core/expressions';
import { draftToRuleInput } from './draftConvert';
import type { BuildOptions, RuleDraft } from './draftTypes';

export interface DraftValidation {
  ok: boolean;
  rule?: Rule;
  /** Mensagens legíveis, na ordem do formulário. */
  messages: string[];
  /** Erros por chave: `name`, `urlPatterns.N`, `container`, `settleMs`, `fields.<id>.locator|value|delay|keyDelay`. */
  byKey: Record<string, string[]>;
}

function add(byKey: Record<string, string[]>, key: string, message: string): void {
  (byKey[key] ??= []).push(message);
}

/** Valida a sintaxe do valor (expressões `{{ }}`) de um campo. */
export function fieldValueError(value: string): string | null {
  const r = validateTemplate(value);
  return r.ok ? null : r.error;
}

interface Placed {
  key: string;
  where: string;
  text: string;
}

function placeIssue(draft: RuleDraft, issue: string): Placed {
  const sep = issue.indexOf(': ');
  const path = sep >= 0 ? issue.slice(0, sep) : '';
  const text = sep >= 0 ? issue.slice(sep + 2) : issue;
  const parts = path.split('.');
  if (parts[0] === 'name') return { key: 'name', where: 'Nome da regra', text };
  if (parts[0] === 'trigger' && parts[1] === 'urlPatterns') {
    const i = Number(parts[2]);
    if (parts[2] !== undefined && Number.isInteger(i)) {
      return { key: `urlPatterns.${i}`, where: `Padrão de URL ${i + 1}`, text };
    }
    return { key: 'urlPatterns', where: 'Padrões de URL', text };
  }
  if (parts[0] === 'trigger' && parts[1] === 'container') {
    return { key: 'container', where: 'Contêiner', text };
  }
  if (parts[0] === 'trigger' && parts[1] === 'settleMs') {
    return { key: 'settleMs', where: 'Espera (ms)', text };
  }
  if (parts[0] === 'fields' && parts[1] !== undefined) {
    const i = Number(parts[1]);
    const f = draft.fields[i];
    if (Number.isInteger(i) && f) {
      const sub =
        parts[2] === 'locator'
          ? 'locator'
          : parts[2] === 'value'
            ? 'value'
            : parts[2] === 'delayMs'
              ? 'delay'
              : parts[2] === 'typing'
                ? 'keyDelay'
                : 'field';
      return { key: `fields.${f.id}.${sub}`, where: `Campo ${i + 1}`, text };
    }
  }
  if (parts[0] === 'fields') return { key: 'fields', where: 'Campos', text };
  return { key: 'rule', where: '', text };
}

/** Monta e valida a regra. Erros do schema e de expressões viram mensagens em português. */
export function validateDraft(draft: RuleDraft, opts: BuildOptions = {}): DraftValidation {
  const byKey: Record<string, string[]> = {};
  const messages: string[] = [];
  const parsed = parseRule(draftToRuleInput(draft, opts));
  if (!parsed.ok) {
    for (const issue of parsed.errors) {
      const p = placeIssue(draft, issue);
      add(byKey, p.key, p.text);
      messages.push(p.where ? `${p.where}: ${p.text}` : p.text);
    }
  }
  draft.fields.forEach((f, i) => {
    const err = fieldValueError(f.value);
    if (err) {
      add(byKey, `fields.${f.id}.value`, err);
      messages.push(`Campo ${i + 1}, valor: ${err}`);
    }
  });
  if (parsed.ok && messages.length === 0) return { ok: true, rule: parsed.rule, messages, byKey };
  return { ok: false, messages, byKey };
}
