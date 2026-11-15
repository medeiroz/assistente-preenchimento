import { describe, expect, it } from 'vitest';
import { frameUrlOf, rulesForFrame } from '../../../src/core/engine';
import { parseRule, type Rule } from '../../../src/core/model';

function rule(id: string, frames?: 'top' | 'all', patterns = ['https://a.com/*']): Rule {
  const r = parseRule({
    id,
    name: id,
    trigger: { urlPatterns: patterns, ...(frames ? { frames } : {}) },
    fields: [{ id: 'f', locator: { by: 'selector', css: '#a' }, value: 'x' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join(';'));
  return r.rule;
}

describe('rulesForFrame', () => {
  const rules = [rule('topo'), rule('topo-explicita', 'top'), rule('todos', 'all')];
  it('no frame de topo rodam todas as que casam', () => {
    expect(rulesForFrame(rules, 'https://a.com/x', true).map((r) => r.id)).toEqual([
      'topo',
      'topo-explicita',
      'todos',
    ]);
  });
  it('num filho só rodam as com frames "all"', () => {
    expect(rulesForFrame(rules, 'https://a.com/x', false).map((r) => r.id)).toEqual(['todos']);
  });
  it('o filho casa pela URL do próprio frame', () => {
    const outra = rule('outra', 'all', ['https://widget.com/*']);
    expect(rulesForFrame([outra], 'https://a.com/x', false)).toEqual([]);
    expect(rulesForFrame([outra], 'https://widget.com/f', false)).toHaveLength(1);
  });
  it('regra desabilitada não roda', () => {
    const off = { ...rule('x', 'all'), enabled: false };
    expect(rulesForFrame([off], 'https://a.com/', false)).toEqual([]);
  });
});

describe('frameUrlOf', () => {
  it('usa a href em frames normais', () => {
    expect(frameUrlOf({ location: { href: 'https://a.com/p?q=1', protocol: 'https:' } })).toBe(
      'https://a.com/p?q=1',
    );
  });
  it('srcdoc/about:blank herdam a origem (window.origin; location.origin vale null neles)', () => {
    const location = { href: 'about:srcdoc', protocol: 'about:' };
    expect(frameUrlOf({ location, origin: 'https://a.com:8080' })).toBe('https://a.com:8080/');
    expect(
      frameUrlOf({
        location: { ...location, ancestorOrigins: ['https://pai.com'] },
        origin: 'null',
      }),
    ).toBe('https://pai.com/');
    expect(frameUrlOf({ location, origin: 'null' })).toBe('about:srcdoc');
  });
});
