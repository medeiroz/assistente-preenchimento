import { describe, expect, it } from 'vitest';
import { decideTabChange } from '../../../src/entrypoints/options/composables/tabs';

describe('decideTabChange', () => {
  it('troca direto quando não há editor aberto', () => {
    expect(decideTabChange({ editorOpen: false, dirty: false })).toBe('switch');
    expect(decideTabChange({ editorOpen: false, dirty: true })).toBe('switch');
  });

  it('fecha o editor e troca quando não há alterações', () => {
    expect(decideTabChange({ editorOpen: true, dirty: false })).toBe('close-and-switch');
  });

  it('pede confirmação quando há alterações não salvas', () => {
    expect(decideTabChange({ editorOpen: true, dirty: true })).toBe('confirm');
  });
});
