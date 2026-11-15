import { describe, expect, it } from 'vitest';
import { decideTabChange, tabForKey } from '../../../src/entrypoints/options/composables/tabs';

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

describe('tabForKey', () => {
  it('as setas percorrem as abas de forma circular', () => {
    expect(tabForKey('rules', 'ArrowRight')).toBe('variables');
    expect(tabForKey('import-export', 'ArrowRight')).toBe('rules');
    expect(tabForKey('variables', 'ArrowLeft')).toBe('rules');
    expect(tabForKey('rules', 'ArrowLeft')).toBe('import-export');
  });

  it('Home e End vão para a primeira e a última', () => {
    expect(tabForKey('history', 'Home')).toBe('rules');
    expect(tabForKey('rules', 'End')).toBe('import-export');
  });

  it('outras teclas não navegam', () => {
    expect(tabForKey('rules', 'Tab')).toBeNull();
    expect(tabForKey('rules', 'ArrowDown')).toBeNull();
  });
});
