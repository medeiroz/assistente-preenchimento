import { AdapterError, type FieldAdapter } from './types';
import { dispatch, setNativeValue } from './dom';
import { isDateControl } from './date';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(['', 'text', 'number', 'email', 'tel', 'search', 'url']);

function isTextControl(el: Element): el is TextControl {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    return TEXT_TYPES.has((el.getAttribute('type') ?? '').toLowerCase());
  }
  return false;
}

function findControl(root: Element): TextControl | null {
  if (root.querySelector('.multiselect')) return null;
  const texts = Array.from(root.querySelectorAll('input, textarea')).filter(isTextControl);
  if (texts.some(isDateControl)) return null; // campos de data pertencem ao dateAdapter
  const only = texts[0];
  return texts.length === 1 && only ? only : null;
}

export const nativeTextAdapter: FieldAdapter = {
  id: 'native-text',
  detect: (root) => findControl(root) !== null,
  read(root) {
    return findControl(root)?.value ?? null;
  },
  isDefault(root, defaultValue) {
    const value = findControl(root)?.value;
    return value !== undefined && value === (defaultValue ?? '');
  },
  async write(root, value) {
    const el = findControl(root);
    if (!el) throw new AdapterError('Controle de texto não encontrado', 'control-not-found');
    if (el.readOnly || el.disabled) {
      throw new AdapterError('Controle somente leitura ou desabilitado', 'write-failed');
    }
    el.focus();
    setNativeValue(el, value);
    dispatch(el, 'input');
    dispatch(el, 'change');
    el.blur();
  },
  async clear(root) {
    await this.write(root, '');
  },
  verify(root, value) {
    return this.read(root) === value;
  },
};
