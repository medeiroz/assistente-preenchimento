import { describe, expect, it } from 'vitest';
import {
  FALLBACK_EXAMPLE_URL,
  buildPreviewContext,
  defaultExampleUrl,
  previewValue,
} from '../../../src/entrypoints/options/composables/preview';

const vars = [{ key: 'codigo_teste', label: '', value: 'ABC123' }];
const NOW = new Date('2026-11-13T15:00:00.000Z');
const base = { variables: vars, exampleUrl: 'https://exemplo.com/', now: NOW };

describe('defaultExampleUrl', () => {
  it('troca * por exemplo no primeiro padrão', () => {
    expect(defaultExampleUrl(['https://site.com/*'])).toBe('https://site.com/exemplo');
    expect(defaultExampleUrl(['https://*.site.com/*'])).toBe('https://exemplo.site.com/exemplo');
    expect(defaultExampleUrl(['*://site.com/*'])).toBe('https://site.com/exemplo');
  });
  it('usa a URL genérica sem padrão ou com padrão inválido', () => {
    expect(defaultExampleUrl([])).toBe(FALLBACK_EXAMPLE_URL);
    expect(defaultExampleUrl(['', '  '])).toBe(FALLBACK_EXAMPLE_URL);
    expect(defaultExampleUrl(['lixo'])).toBe(FALLBACK_EXAMPLE_URL);
  });
  it('pula padrões vazios iniciais', () => {
    expect(defaultExampleUrl(['', 'https://b.com/x'])).toBe('https://b.com/x');
  });
});

describe('buildPreviewContext', () => {
  it('field e text devolvem marcadores', () => {
    const ctx = buildPreviewContext(base);
    expect(ctx.field('CPF')).toBe('‹valor do campo “CPF” na página›');
    expect(ctx.text('.t')).toBe('‹texto de “.t” na página›');
    expect(ctx.variables).toEqual({ codigo_teste: 'ABC123' });
  });
  it('URL inválida cai na genérica', () => {
    expect(buildPreviewContext({ ...base, exampleUrl: 'x' }).url.href).toBe(FALLBACK_EXAMPLE_URL);
  });
});

describe('previewValue', () => {
  it('sem {{ }} não há resultado', () => {
    expect(previewValue('126029000', base)).toEqual({ kind: 'none' });
    expect(previewValue('', base)).toEqual({ kind: 'none' });
  });
  it('resolve variável', () => {
    expect(previewValue('{{ var.codigo_teste }}', base)).toEqual({ kind: 'ok', value: 'ABC123' });
  });
  it('resolve URL de exemplo e filtros', () => {
    const r = previewValue('{{ url.query.ref | default("sem-ref") }}', base);
    expect(r).toEqual({ kind: 'ok', value: 'sem-ref' });
    const r2 = previewValue('{{ url.query.ref }}', {
      ...base,
      exampleUrl: 'https://a.com/?ref=Z9',
    });
    expect(r2).toEqual({ kind: 'ok', value: 'Z9' });
  });
  it('resolve field() com marcador', () => {
    const r = previewValue('{{ field("CPF") }}', base);
    expect(r).toEqual({ kind: 'ok', value: '‹valor do campo “CPF” na página›' });
  });
  it('resolve now', () => {
    const r = previewValue('{{ now | date("DD/MM/YYYY") }}', base);
    expect(r).toEqual({ kind: 'ok', value: '13/11/2026' });
  });
  it('variável ausente vira aviso', () => {
    expect(previewValue('{{ var.nao_existe }}', base).kind).toBe('warn');
  });
});
