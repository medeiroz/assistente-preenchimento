import type { Locator } from '../model';
import { t } from '../i18n';

/** Retorna a RAIZ do campo (ex.: .eui-field), ou null se não encontrado. */
export type LocateFn = (locator: Locator, scope: ParentNode) => Element | null;

/** Descrição legível de um locator, para relatórios e mensagens. */
export function describeLocator(l: Locator): string {
  switch (l.by) {
    case 'label':
      return t('descLabel', l.text);
    case 'selector':
      return t('descSelector', l.css);
    case 'name':
      return `name=${l.name}`;
  }
}

/**
 * Consulta que atravessa shadow roots ABERTOS, sempre em ordem de documento (WP-B2 implementa).
 * Respeita um limite de profundidade para não percorrer árvores patológicas.
 * Um seletor pode usar `>>>` (ver `splitDeepSelector`): cada segmento é resolvido dentro do
 * shadow root do elemento encontrado pelo segmento anterior.
 */
export interface DeepQuery {
  querySelectorAll(scope: ParentNode, selector: string): Element[];
  querySelector(scope: ParentNode, selector: string): Element | null;
}
