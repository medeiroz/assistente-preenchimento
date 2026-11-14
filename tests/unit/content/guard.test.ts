import { describe, expect, it } from 'vitest';
import { claimPage } from '../../../src/entrypoints/content/guard';

describe('claimPage (guarda contra injeção dupla)', () => {
  it('só a primeira chamada assume a página', () => {
    const win = {};
    expect(claimPage(win)).toBe(true);
    expect(claimPage(win)).toBe(false);
    expect(claimPage(win)).toBe(false);
  });

  it('páginas diferentes são independentes', () => {
    expect(claimPage({})).toBe(true);
    expect(claimPage({})).toBe(true);
  });

  it('funciona no window real (happy-dom) e não deixa rastro no DOM', () => {
    expect(claimPage(window)).toBe(true);
    expect(claimPage(window)).toBe(false);
    expect(document.documentElement.getAttributeNames()).toEqual([]);
  });
});
