import { AdapterError, type FieldAdapter, type WriteOptions } from './types';
import { defaultSleep, inShadow, keyInfo, normalizeSpaces, valueMatches } from './dom';
import { deepQuery } from '../locator/deep-query';

const EDITABLE_VALUES = new Set(['', 'true', 'plaintext-only']);

function isEditable(el: Element): el is HTMLElement {
  if ((el as HTMLElement).isContentEditable === true) return true;
  const attr = el.getAttribute('contenteditable');
  return attr !== null && EDITABLE_VALUES.has(attr.toLowerCase());
}

/**
 * Raiz que é, ou contém, exatamente um elemento editável. Campos de formulário na mesma raiz
 * tornam a detecção ambígua: ficam com os adaptadores nativos.
 */
function findEditable(root: Element): HTMLElement | null {
  const found = [root, ...deepQuery.querySelectorAll(root, '[contenteditable]')].filter(isEditable);
  // editores aninhados (filho de um editável): vale o mais externo
  const outer = found.filter((el) => !found.some((o) => o !== el && o.contains(el)));
  const only = outer[0];
  if (outer.length !== 1 || !only) return null;
  if (deepQuery.querySelector(root, 'input, textarea, select')) return null;
  return only;
}

function selectAll(el: HTMLElement): void {
  const doc = el.ownerDocument;
  const selection = doc.defaultView?.getSelection?.();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

interface Edit {
  inputType: string;
  data: string | null;
}

/** `beforeinput` (cancelável) + troca do texto + `input`, sem `execCommand`. */
function applyEdit(el: HTMLElement, edit: Edit, next: string): void {
  const view = el.ownerDocument.defaultView ?? window;
  const composed = inShadow(el);
  const before = new view.InputEvent('beforeinput', {
    inputType: edit.inputType,
    data: edit.data,
    bubbles: true,
    cancelable: true,
    composed,
  });
  // Cancelado = o editor da página assumiu a edição (Lexical, ProseMirror, Draft…).
  if (!el.dispatchEvent(before)) return;
  el.textContent = next;
  el.dispatchEvent(
    new view.InputEvent('input', {
      inputType: edit.inputType,
      data: edit.data,
      bubbles: true,
      composed,
    }),
  );
}

async function typeInto(
  el: HTMLElement,
  text: string,
  keyDelayMs: number,
  sleep: (ms: number) => Promise<void>,
  aborted: () => boolean,
): Promise<void> {
  const view = el.ownerDocument.defaultView ?? window;
  const composed = inShadow(el);
  applyEdit(el, { inputType: 'deleteContentBackward', data: null }, '');
  for (const char of Array.from(text)) {
    if (aborted()) return;
    const { code, keyCode } = keyInfo(char);
    const init = { key: char, code, keyCode, bubbles: true, cancelable: true, composed };
    const down = new view.KeyboardEvent('keydown', init);
    el.dispatchEvent(down);
    if (!down.defaultPrevented) {
      applyEdit(el, { inputType: 'insertText', data: char }, (el.textContent ?? '') + char);
    }
    el.dispatchEvent(new view.KeyboardEvent('keyup', init));
    if (keyDelayMs > 0) await sleep(keyDelayMs);
  }
}

export const contentEditableAdapter: FieldAdapter = {
  id: 'contenteditable',
  detect: (root) => findEditable(root) !== null,
  read(root) {
    const el = findEditable(root);
    return el ? normalizeSpaces(el.textContent) : null;
  },
  isDefault(root, defaultValue) {
    const current = this.read(root);
    return current !== null && current === normalizeSpaces(defaultValue);
  },
  async write(root, value, options?: WriteOptions) {
    const el = findEditable(root);
    if (!el) throw new AdapterError('Elemento editável não encontrado', 'control-not-found');
    el.focus();
    selectAll(el);
    if (options?.typing) {
      await typeInto(
        el,
        value,
        options.typing.keyDelayMs,
        options.sleep ?? defaultSleep,
        options.aborted ?? (() => false),
      );
    } else {
      applyEdit(el, { inputType: 'insertText', data: value }, value);
    }
    el.blur();
  },
  async clear(root) {
    const el = findEditable(root);
    if (!el) throw new AdapterError('Elemento editável não encontrado', 'control-not-found');
    el.focus();
    selectAll(el);
    applyEdit(el, { inputType: 'deleteContentBackward', data: null }, '');
    el.blur();
    if (normalizeSpaces(el.textContent) !== '') {
      throw new AdapterError('não foi possível limpar o texto', 'write-failed');
    }
  },
  verify(root, value, options) {
    const current = this.read(root);
    if (current === null) return false;
    return valueMatches(current, normalizeSpaces(value), options?.typing !== undefined);
  },
};
