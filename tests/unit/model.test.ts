import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRule, summarize, type RunReport } from '../../src/core/model';
import { describeLocator } from '../../src/core/locator';
import { isMessage } from '../../src/shared';

const preset: unknown = JSON.parse(readFileSync('presets/ce-nfse.json', 'utf8'));

function minimalRule(): Record<string, unknown> {
  return {
    id: 'r1',
    name: 'Regra',
    trigger: { urlPatterns: ['https://exemplo.com/*'] },
    fields: [{ id: 'f1', locator: { by: 'label', text: 'Campo' }, value: 'x' }],
    updatedAt: '2026-11-13T00:00:00.000Z',
  };
}

function errorsOf(raw: unknown): string[] {
  const r = parseRule(raw);
  if (r.ok) throw new Error('esperava falha');
  return r.errors;
}

describe('parseRule', () => {
  it('aceita o preset da NFS-e', () => {
    const r = parseRule(preset);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rule.id).toBe('ce-nfse-basico');
      expect(r.rule.fields).toHaveLength(2);
    }
  });

  it('aplica os defaults', () => {
    const r = parseRule(minimalRule());
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.rule.enabled).toBe(true);
    expect(r.rule.trigger.settleMs).toBe(300);
    expect(r.rule.behavior).toEqual({
      mode: 'auto',
      overwrite: 'onlyIfDefault',
      refill: 'oncePerAppearance',
    });
    expect(r.rule.fields[0]?.enabled).toBe(true);
    expect(r.rule.fields[0]?.adapter).toBe('auto');
  });

  it('rejeita ids de campo duplicados', () => {
    const raw = minimalRule();
    raw.fields = [
      { id: 'a', locator: { by: 'name', name: 'n' }, value: '1' },
      { id: 'a', locator: { by: 'name', name: 'm' }, value: '2' },
    ];
    const errors = errorsOf(raw);
    expect(errors.some((e) => e.startsWith('fields:') && e.includes('duplicados: a'))).toBe(true);
  });

  it('rejeita locator by:label sem text', () => {
    const raw = minimalRule();
    raw.fields = [{ id: 'a', locator: { by: 'label' }, value: '1' }];
    const errors = errorsOf(raw);
    expect(errors.some((e) => e.startsWith('fields.0.locator.text'))).toBe(true);
  });

  it('rejeita urlPattern inválido', () => {
    const raw = minimalRule();
    raw.trigger = { urlPatterns: ['exemplo.com'] };
    const errors = errorsOf(raw);
    expect(errors.some((e) => e.startsWith('trigger.urlPatterns.0') && e.includes('padrão'))).toBe(
      true,
    );
  });

  it('rejeita adapter desconhecido', () => {
    const raw = minimalRule();
    raw.fields = [{ id: 'a', locator: { by: 'name', name: 'n' }, adapter: 'xpto', value: '1' }];
    const errors = errorsOf(raw);
    expect(errors.some((e) => e.startsWith('fields.0.adapter'))).toBe(true);
  });

  it('rejeita updatedAt inválido e settleMs fora da faixa', () => {
    const raw = minimalRule();
    raw.updatedAt = 'ontem';
    raw.trigger = { urlPatterns: ['https://a.com/*'], settleMs: 99999 };
    const errors = errorsOf(raw);
    expect(errors.some((e) => e.startsWith('updatedAt'))).toBe(true);
    expect(errors.some((e) => e.startsWith('trigger.settleMs'))).toBe(true);
  });
});

describe('VariableSchema', () => {
  it('rejeita key inválida e aceita válida', async () => {
    const { VariableSchema } = await import('../../src/core/model');
    const bad = VariableSchema.safeParse({ key: 'Codigo-1', label: 'x', value: 'y' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toContain('chave inválida');
    expect(VariableSchema.safeParse({ key: 'codigo_1', label: 'x', value: 'y' }).success).toBe(
      true,
    );
  });
});

describe('summarize', () => {
  it('conta por categoria', () => {
    const base = { description: 'd', previousValue: null };
    const report: RunReport = {
      ruleId: 'r',
      ruleName: 'R',
      startedAt: '2026-11-13T00:00:00.000Z',
      url: 'https://a.com/',
      origin: 'auto',
      fields: [
        { fieldId: '1', outcome: 'filled', ...base },
        { fieldId: '2', outcome: 'filled', ...base },
        { fieldId: '3', outcome: 'skipped-not-default', ...base },
        { fieldId: '4', outcome: 'skipped-disabled', ...base },
        { fieldId: '5', outcome: 'skipped-unresolved-value', ...base },
        { fieldId: '6', outcome: 'skipped-already-handled', ...base },
        { fieldId: '7', outcome: 'not-found', ...base },
        { fieldId: '8', outcome: 'error', ...base },
      ],
    };
    expect(summarize(report)).toEqual({ filled: 2, skipped: 4, notFound: 1, errors: 1 });
  });
});

describe('describeLocator', () => {
  it('descreve cada tipo', () => {
    expect(describeLocator({ by: 'label', text: 'Código NBS' })).toBe('rótulo "Código NBS"');
    expect(describeLocator({ by: 'selector', css: '.x' })).toBe('seletor .x');
    expect(describeLocator({ by: 'name', name: 'foo' })).toBe('name=foo');
  });
});

describe('isMessage', () => {
  it('aceita mensagens conhecidas', () => {
    expect(isMessage({ type: 'config/get' })).toBe(true);
    expect(isMessage({ type: 'run/now', payload: { ruleId: 'a' } })).toBe(true);
    expect(isMessage({ type: 'site/pause', payload: { host: 'a.com', paused: true } })).toBe(true);
  });

  it('rejeita o resto', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage('config/get')).toBe(false);
    expect(isMessage({})).toBe(false);
    expect(isMessage({ type: 'outro' })).toBe(false);
    expect(isMessage({ type: 42 })).toBe(false);
  });
});
