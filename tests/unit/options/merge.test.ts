import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { emptyConfig, type Config, type Rule } from '../../../src/core/model';
import { parseAddition, planMerge } from '../../../src/entrypoints/options/composables/merge';

const rule = (id: string, name = 'Regra'): Rule => ({
  id,
  name,
  enabled: true,
  trigger: { urlPatterns: ['https://a.example/*'], settleMs: 300 },
  behavior: { mode: 'auto', overwrite: 'onlyIfDefault', refill: 'oncePerAppearance' },
  fields: [
    {
      id: 'f',
      enabled: true,
      locator: { by: 'selector', css: '#a' },
      adapter: 'auto',
      value: 'x',
    },
  ],
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const config = (rules: Rule[], vars: Config['variables'] = []): Config => ({
  ...emptyConfig(),
  rules,
  variables: vars,
});

describe('parseAddition', () => {
  it('aceita uma regra no formato do preset', async () => {
    const text = await readFile('presets/ce-nfse.json', 'utf8');
    const res = parseAddition(text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addition.rules).toHaveLength(1);
      expect(res.addition.rules[0]?.id).toBe('ce-nfse-basico');
      expect(res.addition.variables).toEqual([]);
    }
  });

  it('aceita uma configuração completa (regras e variáveis)', () => {
    const cfg = config([rule('a'), rule('b')], [{ key: 'nome', label: 'Nome', value: 'Ana' }]);
    const res = parseAddition(JSON.stringify(cfg));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addition.rules.map((r) => r.id)).toEqual(['a', 'b']);
      expect(res.addition.variables.map((v) => v.key)).toEqual(['nome']);
    }
  });

  it('rejeita JSON inválido, regra inválida e arquivos de outro formato', () => {
    expect(parseAddition('{nope')).toMatchObject({ ok: false });
    expect(parseAddition('[1,2]')).toMatchObject({ ok: false });
    expect(parseAddition('{"foo":1}')).toMatchObject({ ok: false });
    const bad = parseAddition(JSON.stringify({ id: 'x', name: '', trigger: { urlPatterns: [] } }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('Regra inválida');
  });

  it('rejeita configuração sem regras', () => {
    expect(parseAddition(JSON.stringify(emptyConfig()))).toMatchObject({ ok: false });
  });
});

describe('planMerge', () => {
  const now = new Date('2026-05-05T10:00:00.000Z');

  it('mantém ids livres e não toca nas regras existentes', () => {
    const current = config([rule('a')]);
    const plan = planMerge(current, { rules: [rule('b')], variables: [] }, { now });
    expect(plan.rules.map((r) => r.id)).toEqual(['b']);
    expect(plan.renamed).toEqual([]);
    expect(current.rules.map((r) => r.id)).toEqual(['a']);
  });

  it('dá id novo a regras com id já existente e evita colisão entre as novas', () => {
    const current = config([rule('a', 'Minha')]);
    const plan = planMerge(
      current,
      { rules: [rule('a', 'Minha'), rule('a', 'Minha')], variables: [] },
      { now, rng: () => 0.1 },
    );
    const ids = plan.rules.map((r) => r.id);
    expect(ids).not.toContain('a');
    expect(new Set(ids).size).toBe(2);
    expect(plan.renamed).toHaveLength(2);
    expect(plan.renamed[0]).toMatchObject({ name: 'Minha', from: 'a' });
    expect(plan.rules.every((r) => r.updatedAt === now.toISOString())).toBe(true);
  });

  it('adiciona só variáveis novas e nunca altera as existentes', () => {
    const current = config([], [{ key: 'nome', label: 'Nome', value: 'Ana' }]);
    const plan = planMerge(
      current,
      {
        rules: [rule('a')],
        variables: [
          { key: 'nome', label: 'Outro', value: 'Beto' },
          { key: 'cidade', label: 'Cidade', value: 'Recife' },
        ],
      },
      { now },
    );
    expect(plan.newVariables.map((v) => v.key)).toEqual(['cidade']);
    expect(plan.skippedVariables).toEqual(['nome']);
    expect(current.variables[0]?.value).toBe('Ana');
  });
});
