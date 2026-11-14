import { describe, expect, it } from 'vitest';
import { nextVersion } from '../../scripts/next-version.mjs';

describe('nextVersion', () => {
  it('sem tags usa a versão do package.json', () => {
    expect(nextVersion('1.0.0', [])).toBe('1.0.0');
  });
  it('com tag igual à do package.json incrementa o patch', () => {
    expect(nextVersion('1.0.0', ['v1.0.0'])).toBe('1.0.1');
  });
  it('usa a maior tag existente como base', () => {
    expect(nextVersion('1.0.0', ['v1.0.0', 'v1.0.5', 'v1.0.2'])).toBe('1.0.6');
  });
  it('ordena como semver, não como texto', () => {
    expect(nextVersion('1.0.0', ['v1.0.9', 'v1.0.10', 'v1.0.0'])).toBe('1.0.11');
  });
  it('versão nova no package.json sem tag é usada como está', () => {
    expect(nextVersion('1.1.0', ['v1.0.0', 'v1.0.5'])).toBe('1.1.0');
  });
  it('ignora tags fora do formato vX.Y.Z e linhas vazias', () => {
    expect(nextVersion('1.0.0', ['', 'v1.0.0', 'v2.0.0-beta', 'foo'])).toBe('1.0.1');
  });
  it('rejeita versão inválida', () => {
    expect(() => nextVersion('abc', [])).toThrow();
  });
});
