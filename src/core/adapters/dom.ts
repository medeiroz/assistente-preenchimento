/**
 * PRINCÍPIO DOS ADAPTADORES: nunca disparar eventos de teclado que possam chegar ao
 * `document`/`window`. Escape/Enter/Tab sintéticos com `bubbles: true` acionam listeners
 * globais do site (ex.: o modal de NFS-e pergunta "Deseja cancelar a emissão da nota?" ao
 * receber Escape no document) e podem descartar o trabalho do usuário.
 * Para fechar/confirmar widgets use o próprio fluxo do componente (ex.: closeOnSelect) ou
 * `focus()`/`blur()` nativos (não borbulham). Eventos que o framework espera
 * (`input`, `change`, `mousedown`, `click`) podem borbulhar.
 */
export function normalizeSpaces(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Escreve `value` usando o setter nativo do protótipo (contorna wrappers de frameworks). */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const view = el.ownerDocument.defaultView;
  const Ctor =
    el instanceof (view?.HTMLTextAreaElement ?? HTMLTextAreaElement)
      ? (view?.HTMLTextAreaElement ?? HTMLTextAreaElement)
      : (view?.HTMLInputElement ?? HTMLInputElement);
  const setter = Object.getOwnPropertyDescriptor(Ctor.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export function dispatch(
  el: Element,
  type: string,
  init: KeyboardEventInit & MouseEventInit = {},
): void {
  const view = el.ownerDocument.defaultView;
  const common = { bubbles: true, cancelable: true, ...init };
  if (type.startsWith('key') && common.bubbles) {
    throw new Error(`dispatch: evento de teclado "${type}" com bubbles:true é proibido`);
  }
  if (view && (type.startsWith('mouse') || type === 'click')) {
    el.dispatchEvent(new view.MouseEvent(type, { ...common, view }));
  } else if (view && type.startsWith('key')) {
    el.dispatchEvent(new view.KeyboardEvent(type, common));
  } else {
    el.dispatchEvent(new Event(type, common));
  }
}

/** Poll curto até `check` retornar valor truthy; devolve null no timeout. */
export async function waitFor<T>(
  check: () => T | null | undefined | false,
  timeoutMs = 1000,
  intervalMs = 25,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = check();
    if (result) return result;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
