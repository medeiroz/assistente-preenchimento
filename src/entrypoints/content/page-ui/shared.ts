/** Impede que cliques na UI da extensão cheguem a listeners do site (ex.: "clique fora"). */
export function isolateEvents(host: HTMLElement): void {
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
}
