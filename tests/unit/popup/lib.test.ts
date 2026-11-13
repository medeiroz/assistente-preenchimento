import { describe, expect, it, vi } from 'vitest';
import type { FieldOutcome, RunReport } from '../../../src/core/model';
import {
  formatSummary,
  hasFilled,
  modeLabel,
  outcomeLabel,
} from '../../../src/entrypoints/popup/lib/outcome';
import { togglePausedHost } from '../../../src/entrypoints/popup/lib/pause';
import { withTimeout } from '../../../src/entrypoints/popup/lib/timeout';

const report = (outcomes: FieldOutcome[]): RunReport => ({
  ruleId: 'r',
  ruleName: 'R',
  startedAt: '2026-01-01T00:00:00.000Z',
  url: 'http://x/',
  origin: 'manual',
  fields: outcomes.map((outcome, i) => ({
    fieldId: `f${i}`,
    description: `Campo ${i}`,
    outcome,
    previousValue: null,
  })),
});

describe('outcomeLabel', () => {
  it('cobre todos os resultados em português', () => {
    const all: [FieldOutcome, string][] = [
      ['filled', 'Preenchido'],
      ['skipped-not-default', 'Ignorado: já tinha valor'],
      ['skipped-already-handled', 'Já tratado nesta abertura'],
      ['skipped-disabled', 'Desativado'],
      ['skipped-unresolved-value', 'Valor não resolvido'],
      ['not-found', 'Não encontrado'],
      ['error', 'Erro'],
    ];
    for (const [o, l] of all) expect(outcomeLabel(o)).toBe(l);
  });
});

describe('formatSummary / hasFilled / modeLabel', () => {
  it('resume contagens', () => {
    const r = report(['filled', 'filled', 'skipped-disabled', 'not-found', 'error']);
    expect(formatSummary(r)).toBe('2 preenchidos · 1 ignorados · 1 não encontrados · 1 erros');
  });
  it('hasFilled', () => {
    expect(hasFilled(null)).toBe(false);
    expect(hasFilled(report(['error']))).toBe(false);
    expect(hasFilled(report(['error', 'filled']))).toBe(true);
  });
  it('modeLabel', () => {
    expect(modeLabel('auto')).toBe('Automático');
    expect(modeLabel('button')).toBe('Com um clique');
    expect(modeLabel('off')).toBe('Desligado');
  });
});

describe('togglePausedHost', () => {
  it('adiciona sem duplicar e sem mutar', () => {
    const s = { pausedHosts: ['a.com'] };
    const n = togglePausedHost(s, 'b.com', true);
    expect(n.pausedHosts).toEqual(['a.com', 'b.com']);
    expect(togglePausedHost(n, 'b.com', true).pausedHosts).toEqual(['a.com', 'b.com']);
    expect(s.pausedHosts).toEqual(['a.com']);
  });
  it('remove', () => {
    const s = { pausedHosts: ['a.com', 'b.com'] };
    expect(togglePausedHost(s, 'a.com', false).pausedHosts).toEqual(['b.com']);
    expect(togglePausedHost({ pausedHosts: [] }, 'a.com', false).pausedHosts).toEqual([]);
  });
});

describe('withTimeout', () => {
  it('resolve antes do prazo', async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
  });
  it('rejeita por timeout', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<number>(() => {}), 1500);
    const assertion = expect(p).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    vi.useRealTimers();
  });
  it('propaga rejeição', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 50)).rejects.toThrow('x');
  });
});
