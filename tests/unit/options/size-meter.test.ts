import { describe, expect, it } from 'vitest';
import {
  formatKb,
  formatLimit,
  sizeLabel,
  sizeLevel,
} from '../../../src/entrypoints/options/composables/sizeMeter';

describe('sizeMeter', () => {
  it('formata em pt-BR com uma casa', () => {
    expect(formatKb(3174)).toBe('3,1 KB');
    expect(formatLimit(8192)).toBe('8 KB');
    expect(formatLimit(102400)).toBe('100 KB');
    expect(sizeLabel(3174, 8192)).toBe('3,1 KB de 8 KB');
  });

  it('limiares: alerta a partir de 75%, erro acima de 100%', () => {
    expect(sizeLevel(6143, 8192)).toBe('ok');
    expect(sizeLevel(6144, 8192)).toBe('warn');
    expect(sizeLevel(8192, 8192)).toBe('warn');
    expect(sizeLevel(8193, 8192)).toBe('error');
  });
});
