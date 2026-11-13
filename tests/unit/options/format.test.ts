import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  exportJson,
  parseImport,
  summaryText,
  urlHostPath,
} from '../../../src/entrypoints/options/composables/format';
import { emptyConfig, parseRule } from '../../../src/core/model';

const ruleRaw = {
  id: 'r1',
  name: 'R1',
  trigger: { urlPatterns: ['https://a.com/*'] },
  fields: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('exportação', () => {
  it('nome do arquivo usa a data local', () => {
    expect(exportFileName(new Date(2026, 10, 3, 23, 59))).toBe('assistente-config-2026-11-03.json');
  });

  it('exportJson é JSON válido e reimportável', () => {
    const cfg = emptyConfig();
    const r = parseRule(ruleRaw);
    if (!r.ok) throw new Error('regra inválida');
    cfg.rules.push(r.rule);
    const parsed = parseImport(exportJson(cfg));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config).toEqual(cfg);
  });
});

describe('parseImport', () => {
  it('JSON quebrado é erro', () => {
    const r = parseImport('{ nao é json');
    expect(r).toEqual({ ok: false, error: expect.stringContaining('JSON') });
  });

  it('JSON sem schemaVersion é erro (não vira config vazia)', () => {
    expect(parseImport('{}').ok).toBe(false);
    expect(parseImport('[]').ok).toBe(false);
    expect(parseImport('"x"').ok).toBe(false);
  });

  it('versão desconhecida é erro', () => {
    expect(parseImport(JSON.stringify({ schemaVersion: 99, rules: [] })).ok).toBe(false);
  });

  it('todas as regras inválidas é erro', () => {
    const r = parseImport(
      JSON.stringify({ schemaVersion: 1, settings: {}, variables: [], rules: [{ id: 'x' }] }),
    );
    expect(r.ok).toBe(false);
  });

  it('descarta regras ruins com aviso e mantém as boas', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 1,
        settings: {},
        variables: [{ key: 'Inválida', label: '', value: '' }],
        rules: [ruleRaw, { id: 'ruim' }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.rules).toHaveLength(1);
      expect(r.config.variables).toHaveLength(0);
      expect(r.warnings.length).toBe(2);
    }
  });

  it('configuração vazia válida é aceita', () => {
    const r = parseImport(JSON.stringify(emptyConfig()));
    expect(r.ok).toBe(true);
  });
});

describe('histórico', () => {
  it('urlHostPath remove query e fragmento', () => {
    expect(urlHostPath('https://app.x.com/vendas/rel?token=abc#z')).toBe('app.x.com/vendas/rel');
    expect(urlHostPath('http://localhost:3000/?ref=1')).toBe('localhost:3000/');
    expect(urlHostPath('não é url?a=1')).toBe('não é url');
  });

  it('summaryText descreve só o que aconteceu', () => {
    const base = { ruleId: 'r', ruleName: 'R', startedAt: '', url: '', origin: 'auto' as const };
    const f = (outcome: 'filled' | 'not-found' | 'error' | 'skipped-disabled') => ({
      fieldId: outcome,
      description: outcome,
      outcome,
      previousValue: null,
    });
    expect(summaryText({ ...base, fields: [f('filled'), f('filled'), f('not-found')] })).toBe(
      '2 preenchidos, 1 não encontrado',
    );
    expect(summaryText({ ...base, fields: [f('skipped-disabled'), f('error')] })).toBe(
      '1 pulado, 1 erro',
    );
    expect(summaryText({ ...base, fields: [] })).toBe('nenhum campo');
  });
});
