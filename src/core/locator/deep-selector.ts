/** Separador de seletor profundo: atravessa shadow roots abertos (`host >>> interno`). */
export const DEEP_COMBINATOR = '>>>';

/**
 * Divide um seletor profundo em segmentos CSS (`a >>> b >>> c` -> ['a', 'b', 'c']).
 * Cada segmento vem sem espaços nas pontas. Sem `>>>`, devolve o seletor inteiro como único
 * segmento. Retorna [] se algum segmento for vazio (cadeia inválida).
 */
export function splitDeepSelector(css: string): string[] {
  const parts = css.split(DEEP_COMBINATOR).map((s) => s.trim());
  if (parts.some((s) => s === '')) return [];
  return parts;
}
