import type { Locator } from '../model';

/** Retorna a RAIZ do campo (ex.: .eui-field), ou null se não encontrado. */
export type LocateFn = (locator: Locator, scope: ParentNode) => Element | null;

/** Descrição legível de um locator, para relatórios e mensagens. */
export function describeLocator(l: Locator): string {
  switch (l.by) {
    case 'label':
      return `rótulo "${l.text}"`;
    case 'selector':
      return `seletor ${l.css}`;
    case 'name':
      return `name=${l.name}`;
  }
}
