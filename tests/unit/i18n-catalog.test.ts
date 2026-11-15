import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultMessage,
  formatMessage,
  setTranslator,
  t,
  uiLocale,
  type Catalog,
} from '../../src/core/i18n';

const ROOT = path.resolve(import.meta.dirname, '../..');

function loadCatalog(locale: string): Catalog {
  const file = path.join(ROOT, 'public/_locales', locale, 'messages.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Catalog;
}

const pt = loadCatalog('pt_BR');
const en = loadCatalog('en');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|vue)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Chaves referenciadas em chamadas literais: t('k'), tl('k') e $t('k'). */
function usedKeys(): Map<string, string> {
  const used = new Map<string, string>();
  const re = /(?<![\w.])(?:t|tl|\$t)\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) used.set(m[1] as string, path.relative(ROOT, file));
  }
  return used;
}

/**
 * Chaves que existem nos catálogos sem uma chamada literal t('...') no código:
 * - extName / extDescription: lidas pelo Chrome a partir do manifest (`__MSG_extName__`,
 *   `__MSG_extDescription__`), não pelo código da extensão.
 */
const UNUSED_ALLOWED = new Set(['extName', 'extDescription']);

/**
 * Chamadas t(...) cujo primeiro argumento não é uma chave literal (não dá para verificar).
 * Cada exceção precisa de uma justificativa. Hoje não há nenhuma.
 */
const DYNAMIC_CALL_ALLOWED: string[] = [];

/**
 * Linhas exatas com chave dinâmica:
 * - schema.ts: o auxiliar `tl(key)` repassa a chave literal recebida de cada chamada `tl('...')`
 *   (essas chamadas são varridas normalmente).
 */
const DYNAMIC_LINE_ALLOWED = ['const tl = (key: string) => ({ error: () => t(key) });'];

describe('catálogos de tradução', () => {
  it('toda chave usada no código existe nos dois catálogos', () => {
    const missing: string[] = [];
    for (const [key, file] of usedKeys()) {
      if (!(key in pt)) missing.push(`${key} (pt_BR, usada em ${file})`);
      if (!(key in en)) missing.push(`${key} (en, usada em ${file})`);
    }
    expect(missing).toEqual([]);
  });

  it('não sobra chave nos catálogos sem uso no código', () => {
    const used = usedKeys();
    const unused = Object.keys(pt).filter((k) => !used.has(k) && !UNUSED_ALLOWED.has(k));
    expect(unused).toEqual([]);
  });

  it('o código não chama t() com chave dinâmica', () => {
    const offenders: string[] = [];
    const re = /(?<![\w.$])(?:t|tl)\((?!\s*['"`][A-Za-z0-9_]+['"`])/g;
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      const rel = path.relative(ROOT, file);
      if (DYNAMIC_CALL_ALLOWED.includes(rel)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/function\s+t\(|^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (DYNAMIC_LINE_ALLOWED.some((a) => line.includes(a))) return;
        if (re.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        re.lastIndex = 0;
      });
    }
    expect(offenders).toEqual([]);
  });

  it('os dois catálogos têm o mesmo conjunto de chaves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });

  it('as chaves só usam letras, números e _', () => {
    for (const key of Object.keys(pt)) expect(key).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it('os dois catálogos têm os mesmos placeholders, todos usados na mensagem', () => {
    for (const key of Object.keys(pt)) {
      const a = pt[key] as Catalog[string];
      const b = en[key] as Catalog[string];
      expect(Object.entries(b.placeholders ?? {}), key).toEqual(
        Object.entries(a.placeholders ?? {}),
      );
      for (const entry of [a, b]) {
        const referenced = [...entry.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map((m) => m[1]);
        expect(referenced.sort(), key).toEqual(Object.keys(entry.placeholders ?? {}).sort());
        expect(entry.message.trim(), key).not.toBe('');
      }
    }
  });
});

describe('t()', () => {
  afterEach(() => setTranslator(null));

  it('substitui $1.. do catálogo padrão', () => {
    expect(t('vDupFieldIds', 'a, b')).toBe('ids de campo duplicados: a, b');
    expect(t('migVarDiscarded', 3, 'x')).toBe('Variável #3 descartada: x');
    expect(defaultMessage('exWithPosition', 'Erro', 7)).toBe('Erro (posição 7)');
  });

  it('formatMessage aplica placeholders nomeados, posicionais e $$', () => {
    const entry = {
      message: 'A $first$ B $SECOND$ C $1 D $$',
      placeholders: { first: { content: '$1' }, second: { content: '$2' } },
    };
    expect(formatMessage(entry, ['x', 2])).toBe('A x B 2 C x D $');
    expect(formatMessage({ message: 'sem $1' }, [])).toBe('sem ');
  });

  it('chave desconhecida devolve a própria chave', () => {
    expect(t('naoExiste')).toBe('naoExiste');
  });

  it('usa o tradutor injetado e cai no padrão quando ele devolve vazio', () => {
    const calls: [string, string[] | undefined][] = [];
    setTranslator((key, subs) => {
      calls.push([key, subs]);
      return key === 'exEmpty' ? 'Empty expression' : '';
    }, 'en-US');
    expect(t('exEmpty')).toBe('Empty expression');
    expect(t('exUnknownFilter', 'foo')).toBe('Filtro desconhecido: "foo"');
    expect(calls[1]).toEqual(['exUnknownFilter', ['foo']]);
    expect(uiLocale()).toBe('en-US');
    setTranslator(null);
    expect(uiLocale()).toBe('pt-BR');
  });

  it('o catálogo en, aplicado como tradutor, traduz as mensagens do Zod no momento da validação', async () => {
    const { parseRule } = await import('../../src/core/model');
    const translate = (key: string, subs?: string[]) => {
      const entry = en[key];
      return entry ? formatMessage(entry, subs ?? []) : '';
    };
    const bad = { id: '', name: 'x', trigger: { urlPatterns: ['https://a.com/*'] }, fields: [] };
    const ptResult = parseRule(bad);
    expect(ptResult.ok ? [] : ptResult.errors).toContain('id: o id da regra não pode ser vazio');
    setTranslator(translate, 'en');
    const enResult = parseRule(bad);
    expect(enResult.ok ? [] : enResult.errors).toContain('id: the rule id cannot be empty');
  });
});
