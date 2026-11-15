import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ConfigSchema,
  CURRENT_SCHEMA_VERSION,
  LocatorSchema,
  RuleSchema,
  VariableSchema,
  parseRule,
  rulePriority,
  triggerFrames,
  variableScope,
} from '../../src/core/model';
import { splitDeepSelector } from '../../src/core/locator';

const baseRule = {
  id: 'r',
  name: 'R',
  trigger: { urlPatterns: ['https://a.com/*'] },
  fields: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Rule.priority', () => {
  it('ausente é válido e não é preenchido', () => {
    const r = RuleSchema.parse(baseRule);
    expect('priority' in r).toBe(false);
    expect(rulePriority(r)).toBe(50);
  });
  it('aceita 0, 100 e 73', () => {
    for (const p of [0, 73, 100]) {
      expect(rulePriority(RuleSchema.parse({ ...baseRule, priority: p }))).toBe(p);
    }
  });
  it.each([-1, 101, 1.5])('rejeita %s', (p) => {
    expect(parseRule({ ...baseRule, priority: p }).ok).toBe(false);
  });
});

describe('Variable.scope', () => {
  const v = { key: 'k', label: 'K', value: 'x' };
  it('ausente é válido e padrão sync', () => {
    const r = VariableSchema.parse(v);
    expect('scope' in r).toBe(false);
    expect(variableScope(r)).toBe('sync');
  });
  it('aceita sync e local', () => {
    expect(variableScope(VariableSchema.parse({ ...v, scope: 'local' }))).toBe('local');
    expect(variableScope(VariableSchema.parse({ ...v, scope: 'sync' }))).toBe('sync');
  });
  it('rejeita valor desconhecido', () => {
    expect(VariableSchema.safeParse({ ...v, scope: 'x' }).success).toBe(false);
  });
});

describe('Trigger.frames', () => {
  const parse = (frames?: unknown) =>
    RuleSchema.safeParse({
      ...baseRule,
      trigger: { ...baseRule.trigger, ...(frames === undefined ? {} : { frames }) },
    });
  it('ausente é válido, padrão top, e não é preenchido', () => {
    const r = parse();
    expect(r.success).toBe(true);
    if (r.success) {
      expect('frames' in r.data.trigger).toBe(false);
      expect(triggerFrames(r.data.trigger)).toBe('top');
    }
  });
  it('aceita top e all', () => {
    const a = parse('all');
    expect(a.success && triggerFrames(a.data.trigger)).toBe('all');
    expect(parse('top').success).toBe(true);
  });
  it('rejeita valor desconhecido', () => {
    expect(parse('x').success).toBe(false);
  });
});

describe('splitDeepSelector', () => {
  it('divide por >>> com ou sem espaços', () => {
    expect(splitDeepSelector('a >>> b')).toEqual(['a', 'b']);
    expect(splitDeepSelector('a>>>b')).toEqual(['a', 'b']);
    expect(splitDeepSelector('a >>> b >>> c')).toEqual(['a', 'b', 'c']);
  });
  it('sem >>> devolve o seletor inteiro', () => {
    expect(splitDeepSelector('div.x > span')).toEqual(['div.x > span']);
  });
  it('segmento vazio é inválido', () => {
    expect(splitDeepSelector(' >>> b')).toEqual([]);
    expect(splitDeepSelector('a >>> ')).toEqual([]);
  });
});

describe('Locator selector com >>>', () => {
  const parse = (css: string) => LocatorSchema.safeParse({ by: 'selector', css });
  it('aceita cadeias válidas e seletores simples', () => {
    expect(parse('my-host >>> input').success).toBe(true);
    expect(parse('a>>>b>>>c').success).toBe(true);
    expect(parse('input.x').success).toBe(true);
  });
  it('rejeita segmento vazio com mensagem em português', () => {
    for (const css of [' >>> b', 'a >>> ', 'a >>>  >>> b']) {
      const r = parse(css);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toContain('>>>');
    }
  });
});

describe('ida e volta de configs da 1.0.2', () => {
  it.each(['e2e-harness', 'ce-nfse'])('preset %s não ganha campos novos', (name) => {
    const raw = JSON.parse(readFileSync(`presets/${name}.json`, 'utf8')) as unknown;
    const rules = Array.isArray(raw) ? raw : [raw];
    const cfg = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      settings: { pausedHosts: [] },
      variables: [],
      rules,
    };
    const parsed = ConfigSchema.parse(cfg);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(cfg);
  });
});
