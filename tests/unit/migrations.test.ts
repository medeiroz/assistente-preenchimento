import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyConfig, migrateConfig, parseRule } from '../../src/core/model';

const presetRaw: unknown = JSON.parse(readFileSync('presets/ce-nfse.json', 'utf8'));

function validRule(id: string): Record<string, unknown> {
  return { ...(presetRaw as Record<string, unknown>), id };
}

describe('migrateConfig', () => {
  it('undefined/vazio vira config vazia sem warnings', () => {
    expect(migrateConfig(undefined)).toEqual({ config: emptyConfig(), warnings: [] });
    expect(migrateConfig({})).toEqual({ config: emptyConfig(), warnings: [] });
    expect(migrateConfig(null)).toEqual({ config: emptyConfig(), warnings: [] });
  });

  it('config válida passa intacta', () => {
    const parsed = parseRule(validRule('a'));
    if (!parsed.ok) throw new Error('preset inválido');
    const cfg = {
      schemaVersion: 1,
      settings: { pausedHosts: ['x.com'] },
      variables: [{ key: 'codigo', label: 'Código', value: '1' }],
      rules: [parsed.rule],
    };
    const { config, warnings } = migrateConfig(cfg);
    expect(warnings).toEqual([]);
    expect(config).toEqual(cfg);
  });

  it('descarta regra inválida e mantém as outras', () => {
    const bad = { ...validRule('ruim'), trigger: { urlPatterns: ['nada'] } };
    const { config, warnings } = migrateConfig({
      schemaVersion: 1,
      settings: {},
      variables: [],
      rules: [validRule('a'), bad, validRule('b')],
    });
    expect(config.rules.map((r) => r.id)).toEqual(['a', 'b']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"ruim"');
    expect(warnings[0]).toContain('trigger.urlPatterns');
  });

  it('descarta regra e variável duplicadas', () => {
    const { config, warnings } = migrateConfig({
      schemaVersion: 1,
      settings: {},
      variables: [
        { key: 'a', label: '', value: '1' },
        { key: 'a', label: '', value: '2' },
      ],
      rules: [validRule('x'), validRule('x')],
    });
    expect(config.variables).toHaveLength(1);
    expect(config.rules).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it('schemaVersion mais nova carrega o que valida e sinaliza somente leitura', () => {
    const { config, warnings, readOnly } = migrateConfig({
      schemaVersion: 99,
      rules: [validRule('a'), { id: 'ruim' }],
    });
    expect(readOnly).toBe(true);
    expect(config.rules.map((r) => r.id)).toEqual(['a']);
    expect(warnings.some((w) => w.includes('99'))).toBe(true);
    expect(warnings.some((w) => w.includes('"ruim"'))).toBe(true);
  });

  it('schemaVersion inválida (não inteira ou < 1) vira vazia com warning', () => {
    for (const v of [0, 1.5, -1]) {
      const { config, warnings, readOnly } = migrateConfig({ schemaVersion: v, rules: [] });
      expect(config).toEqual(emptyConfig());
      expect(warnings).toHaveLength(1);
      expect(readOnly).toBeUndefined();
    }
  });

  it('objeto sem schemaVersion vira vazio com warning', () => {
    const { config, warnings } = migrateConfig({ rules: [] });
    expect(config).toEqual(emptyConfig());
    expect(warnings).toHaveLength(1);
  });
});
