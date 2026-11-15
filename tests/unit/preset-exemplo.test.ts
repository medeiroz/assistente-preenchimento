import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RuleSchema } from '../../src/core/model/schema';
import { exampleAddition } from '../../src/entrypoints/options/composables/example';

const text = readFileSync('presets/exemplo-cadastro.json', 'utf8');
const raw: unknown = JSON.parse(text);

describe('preset exemplo-cadastro', () => {
  it('passa no RuleSchema', () => {
    const r = RuleSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.id).toBe('exemplo-cadastro');
      expect(r.data.behavior.mode).toBe('button');
      expect(r.data.fields.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('é fictício e genérico', () => {
    expect(text).not.toMatch(/clinicaexperts|Cl[ií]nica Experts/i);
    expect(text).toContain('exemplo.test');
  });

  it('é o que o botão "Importar exemplo" importa', () => {
    expect(exampleAddition()?.rules.map((r) => r.id)).toEqual(['exemplo-cadastro']);
  });
});
