import { describe, expect, it } from 'vitest';
import { parseRule, type Rule, type Trigger } from '../../../src/core/model';
import {
  containerMatches,
  matchesTrigger,
  matchesUrlPattern,
  overlappingRules,
  patternsMayOverlap,
  rulesForUrl,
} from '../../../src/core/engine';

function trigger(t: Partial<Trigger> & Pick<Trigger, 'urlPatterns'>): Trigger {
  return { settleMs: 300, ...t };
}

function rule(id: string, enabled: boolean, urlPattern: string, mode = 'auto'): Rule {
  const r = parseRule({
    id,
    name: id,
    enabled,
    trigger: { urlPatterns: [urlPattern] },
    behavior: { mode },
    fields: [],
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join(','));
  return r.rule;
}

describe('matchesUrlPattern', () => {
  it('ignora a porta da URL (como o Chrome)', () => {
    expect(matchesUrlPattern('http://localhost/*', 'http://localhost:5173/x?a=1')).toBe(true);
    expect(matchesUrlPattern('http://127.0.0.1/*', 'http://127.0.0.1:8080/')).toBe(true);
    expect(matchesUrlPattern('http://localhost/*', 'http://localhost.evil.com:80/')).toBe(false);
  });

  it('casa host exato com path curinga', () => {
    const p = 'https://app.clinicaexperts.com.br/*';
    expect(matchesUrlPattern(p, 'https://app.clinicaexperts.com.br/')).toBe(true);
    expect(matchesUrlPattern(p, 'https://app.clinicaexperts.com.br/notas/1')).toBe(true);
    expect(matchesUrlPattern(p, 'https://outro.clinicaexperts.com.br/')).toBe(false);
    expect(matchesUrlPattern(p, 'http://app.clinicaexperts.com.br/')).toBe(false);
  });

  it('scheme * casa http e https, mas não outros', () => {
    const p = '*://*.example.com/a/*';
    expect(matchesUrlPattern(p, 'http://x.example.com/a/b')).toBe(true);
    expect(matchesUrlPattern(p, 'https://x.y.example.com/a/')).toBe(true);
    expect(matchesUrlPattern(p, 'https://example.com/a/b')).toBe(true);
    expect(matchesUrlPattern(p, 'https://notexample.com/a/b')).toBe(false);
    expect(matchesUrlPattern(p, 'https://x.example.com/b/a')).toBe(false);
    expect(matchesUrlPattern(p, 'ftp://x.example.com/a/b')).toBe(false);
  });

  it('host curinga casa qualquer host', () => {
    expect(matchesUrlPattern('https://*/foo', 'https://qualquer.com/foo')).toBe(true);
    expect(matchesUrlPattern('https://*/foo', 'https://qualquer.com/bar')).toBe(false);
  });

  it('path exato', () => {
    const p = 'https://a.com/notas';
    expect(matchesUrlPattern(p, 'https://a.com/notas')).toBe(true);
    expect(matchesUrlPattern(p, 'https://a.com/notas/')).toBe(false);
    expect(matchesUrlPattern(p, 'https://a.com/notas/1')).toBe(false);
  });

  it('ignora query e hash no casamento do path', () => {
    expect(matchesUrlPattern('https://a.com/notas', 'https://a.com/notas?x=1#h')).toBe(true);
    expect(matchesUrlPattern('https://a.com/*', 'https://a.com/x?y=1')).toBe(true);
  });

  it('curinga no meio do path e caracteres especiais escapados', () => {
    expect(matchesUrlPattern('https://a.com/n/*/edit', 'https://a.com/n/12/edit')).toBe(true);
    expect(matchesUrlPattern('https://a.com/a.b', 'https://a.com/axb')).toBe(false);
  });

  it('padrão ou URL inválidos não casam', () => {
    expect(matchesUrlPattern('lixo', 'https://a.com/')).toBe(false);
    expect(matchesUrlPattern('https://a.com/*', 'não é url')).toBe(false);
  });
});

describe('matchesTrigger', () => {
  const t = trigger({ urlPatterns: ['https://a.com/*', 'https://b.com/*'] });

  it('algum urlPattern casa', () => {
    expect(matchesTrigger(t, 'https://b.com/x')).toBe(true);
    expect(matchesTrigger(t, 'https://c.com/x')).toBe(false);
  });

  it('exige todos os queryParams com valor igual', () => {
    const q = trigger({ urlPatterns: ['https://a.com/*'], queryParams: { tab: 'nfse', x: '1' } });
    expect(matchesTrigger(q, 'https://a.com/p?tab=nfse&x=1&z=9')).toBe(true);
    expect(matchesTrigger(q, 'https://a.com/p?tab=nfse')).toBe(false);
    expect(matchesTrigger(q, 'https://a.com/p?tab=outra&x=1')).toBe(false);
    expect(matchesTrigger(q, 'https://a.com/p')).toBe(false);
  });
});

describe('rulesForUrl', () => {
  it('filtra só enabled e trigger, sem olhar o modo', () => {
    const rules = [
      rule('on', true, 'https://a.com/*'),
      rule('off-flag', false, 'https://a.com/*'),
      rule('other', true, 'https://b.com/*'),
      rule('mode-off', true, 'https://a.com/*', 'off'),
    ];
    expect(rulesForUrl(rules, 'https://a.com/x').map((r) => r.id)).toEqual(['on', 'mode-off']);
  });
});

describe('containerMatches', () => {
  function modal(text: string): Element {
    document.body.innerHTML = `<div class="modal is-active"><h1>${text}</h1></div>`;
    const el = document.querySelector('.modal');
    if (!el) throw new Error('sem modal');
    return el;
  }

  it('só seletor', () => {
    expect(containerMatches(modal('Qualquer'), { selector: '.modal.is-active' })).toBe(true);
    expect(containerMatches(modal('Qualquer'), { selector: '.modal.other' })).toBe(false);
  });

  it('com textContains, normalizando espaços', () => {
    const el = modal('Emitir   Nota\n Fiscal');
    expect(containerMatches(el, { selector: '.modal', textContains: 'Emitir Nota Fiscal' })).toBe(
      true,
    );
    expect(containerMatches(el, { selector: '.modal', textContains: 'Cancelar' })).toBe(false);
  });
});

describe('patternsMayOverlap', () => {
  it('mesmo host e caminhos', () => {
    expect(patternsMayOverlap('https://a.com/x/*', 'https://a.com/x/*')).toBe(true);
    expect(patternsMayOverlap('https://a.com/*', 'https://a.com/x')).toBe(true);
  });
  it('hosts diferentes', () => {
    expect(patternsMayOverlap('https://a.com/*', 'https://b.com/*')).toBe(false);
  });
  it('curingas de host', () => {
    expect(patternsMayOverlap('https://*.a.com/*', 'https://www.a.com/*')).toBe(true);
    expect(patternsMayOverlap('https://*.a.com/*', 'https://a.com/*')).toBe(true);
    expect(patternsMayOverlap('https://*.a.com/*', 'https://b.com/*')).toBe(false);
    expect(patternsMayOverlap('https://*.a.com/*', 'https://*.b.a.com/*')).toBe(true);
    expect(patternsMayOverlap('*://*/*', 'https://qualquer.com/x')).toBe(true);
  });
  it('esquemas', () => {
    expect(patternsMayOverlap('http://a.com/*', 'https://a.com/*')).toBe(false);
    expect(patternsMayOverlap('*://a.com/*', 'https://a.com/*')).toBe(true);
  });
  it('caminhos', () => {
    expect(patternsMayOverlap('https://a.com/a/*', 'https://a.com/a/b')).toBe(true);
    expect(patternsMayOverlap('https://a.com/a/*', 'https://a.com/b/*')).toBe(false);
    expect(patternsMayOverlap('https://a.com/*/novo', 'https://a.com/a/*')).toBe(true);
    expect(patternsMayOverlap('https://a.com/a', 'https://a.com/b')).toBe(false);
  });
  it('padrão inválido não se sobrepõe', () => {
    expect(patternsMayOverlap('lixo', 'https://a.com/*')).toBe(false);
  });
});

describe('overlappingRules', () => {
  const mk = (id: string, enabled: boolean, p: string): Rule => {
    const r = parseRule({
      id,
      name: `Regra ${id}`,
      enabled,
      trigger: { urlPatterns: [p], settleMs: 300 },
      behavior: { mode: 'auto', overwrite: 'always' },
      fields: [],
      updatedAt: '2026-11-13T00:00:00.000Z',
    });
    if (!r.ok) throw new Error(r.errors.join('; '));
    return r.rule;
  };
  it('ignora a própria, desligadas e disjuntas', () => {
    const self = mk('a', true, 'https://a.com/x/*');
    const out = overlappingRules(self, [
      self,
      mk('b', true, 'https://a.com/*'),
      mk('c', false, 'https://a.com/*'),
      mk('d', true, 'https://b.com/*'),
    ]);
    expect(out.map((r) => r.id)).toEqual(['b']);
  });
});
