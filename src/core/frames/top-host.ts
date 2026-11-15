function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Host de topo de um frame, para a pausa por site: `ancestorOrigins` (Chrome) traz a origem do
 * frame de topo no último item; senão vale a URL de topo informada pelo background; por último, o
 * host do próprio frame.
 */
export function topHostOf(
  loc: { hostname: string; ancestorOrigins?: ArrayLike<string> },
  isTop: boolean,
  backgroundTopUrl?: string,
): string {
  if (isTop) return loc.hostname;
  const origins = loc.ancestorOrigins;
  if (origins && origins.length > 0) {
    const host = hostnameOf(origins[origins.length - 1]);
    if (host) return host;
  }
  return hostnameOf(backgroundTopUrl) || loc.hostname;
}

/** Origem do topo vista de um frame filho (`ancestorOrigins`), se o navegador a expõe. */
export function topOriginOf(loc: { ancestorOrigins?: ArrayLike<string> }): string | undefined {
  const origins = loc.ancestorOrigins;
  const last = origins && origins.length > 0 ? origins[origins.length - 1] : undefined;
  return last && last !== 'null' ? last : undefined;
}
