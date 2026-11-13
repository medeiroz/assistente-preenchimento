export const HIGHLIGHT_DURATION_MS = 2000;

const pending = new WeakMap<
  HTMLElement,
  { original: string; timer: ReturnType<typeof setTimeout> }
>();

/** Outline temporário (inline) nos controles; restaura o valor original depois. */
export function highlight(roots: Element[]): void {
  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue;
    const prev = pending.get(root);
    if (prev) clearTimeout(prev.timer);
    const original = prev ? prev.original : root.style.outline;
    root.style.outline = '2px solid #22c55e';
    const timer = setTimeout(() => {
      root.style.outline = original;
      pending.delete(root);
    }, HIGHLIGHT_DURATION_MS);
    pending.set(root, { original, timer });
  }
}
