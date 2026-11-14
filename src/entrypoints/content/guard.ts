const FLAG = '__assistentePreenchimentoAtivo';

/**
 * Garante um único motor por página. O content script pode chegar por três caminhos
 * (manifest no build de testes, registro dinâmico e injeção sob demanda do popup); a flag vive
 * no mundo isolado da extensão, então a página não a enxerga nem a falsifica.
 * Devolve true só na primeira chamada; nas seguintes, quem chamou deve abortar.
 */
export function claimPage(target: object): boolean {
  if (Reflect.get(target, FLAG) === true) return false;
  Reflect.set(target, FLAG, true);
  return true;
}
