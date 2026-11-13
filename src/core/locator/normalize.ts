/**
 * Normaliza um rótulo para comparação: remove espaços extras, `*` e `:` no fim,
 * acentos e diferenças de caixa.
 */
export function normalizeLabel(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s*:]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
