/**
 * Guarda o alvo do último `contextmenu` do frame (menu "Capturar este campo"). O clique no item
 * do menu chega ao background, que pede a captura a este frame: o elemento só é conhecido aqui.
 * Listener passivo, em captura (o site não consegue escondê-lo) e sem efeito sobre a página.
 */
export interface ContextTarget {
  /** Elemento ainda conectado que recebeu o último `contextmenu`, ou `null`. */
  take(): Element | null;
  dispose(): void;
}

export function trackContextTarget(win: Window = window): ContextTarget {
  let last: Element | null = null;
  const onContext = (ev: Event): void => {
    // composedPath()[0] atravessa shadow roots abertos (ev.target seria só o host).
    const first = ev.composedPath()[0] ?? ev.target;
    last = first !== null && (first as Node).nodeType === 1 ? (first as Element) : null;
  };
  win.addEventListener('contextmenu', onContext, { capture: true, passive: true });
  return {
    take: () => (last?.isConnected ? last : null),
    dispose: () => win.removeEventListener('contextmenu', onContext, true),
  };
}
