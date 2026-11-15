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

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Remove tudo que não é letra/dígito (compara valores que uma máscara pode ter reformatado). */
export function stripNonAlnum(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, '');
}

/** Igualdade exata ou, com digitação simulada, igualdade ignorando a pontuação da máscara. */
export function valueMatches(actual: string | null, expected: string, typed: boolean): boolean {
  if (actual === null) return false;
  if (actual === expected) return true;
  return typed && stripNonAlnum(actual) === stripNonAlnum(expected);
}

function keyInfo(char: string): { code: string; keyCode: number } {
  if (/^[a-zA-Z]$/.test(char))
    return { code: `Key${char.toUpperCase()}`, keyCode: char.toUpperCase().charCodeAt(0) };
  if (/^[0-9]$/.test(char)) return { code: `Digit${char}`, keyCode: char.charCodeAt(0) };
  if (char === ' ') return { code: 'Space', keyCode: 32 };
  return { code: '', keyCode: char.toUpperCase().charCodeAt(0) };
}

/**
 * Digita `text` caractere a caractere (para campos com máscara/busca automática que só
 * reagem a digitação real). Só emite teclas IMPRIMÍVEIS (nunca Escape/Enter/Tab): os eventos
 * de tecla borbulham, mas um caractere não aciona atalhos globais do site.
 * Se keydown/keypress forem cancelados (preventDefault) o caractere não é inserido, como no
 * navegador. Respeita `maxLength`. Devolve false se interrompido por `aborted`.
 */
export async function typeText(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  keyDelayMs: number,
  sleep: (ms: number) => Promise<void> = defaultSleep,
  aborted: () => boolean = () => false,
): Promise<boolean> {
  const view = el.ownerDocument.defaultView ?? window;
  el.focus();
  setNativeValue(el, '');
  el.dispatchEvent(
    new view.InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }),
  );
  for (const char of Array.from(text)) {
    if (aborted()) return false;
    const { code, keyCode } = keyInfo(char);
    const init = { key: char, code, keyCode, charCode: 0, bubbles: true, cancelable: true };
    const down = new view.KeyboardEvent('keydown', init);
    el.dispatchEvent(down);
    const press = new view.KeyboardEvent('keypress', { ...init, charCode: char.charCodeAt(0) });
    const pressOk = el.dispatchEvent(press);
    const room = el.maxLength < 0 || el.value.length < el.maxLength;
    if (!down.defaultPrevented && pressOk && room) {
      setNativeValue(el, el.value + char);
      el.dispatchEvent(
        new view.InputEvent('input', { inputType: 'insertText', data: char, bubbles: true }),
      );
    }
    el.dispatchEvent(new view.KeyboardEvent('keyup', init));
    if (keyDelayMs > 0) await sleep(keyDelayMs);
  }
  if (aborted()) return false;
  dispatch(el, 'change');
  el.blur();
  return true;
}
