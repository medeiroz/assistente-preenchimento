import { AdapterError, type FieldAdapter } from './types';
import { defaultSleep, dispatch, setNativeValue, typeText, valueMatches } from './dom';
import { isDateControl } from './date';
import { deepQuery } from '../locator/deep-query';
import { t } from '../i18n';

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
  if (deepQuery.querySelector(root, '.multiselect')) return null;
  const texts = isTextControl(root)
    ? [root]
    : deepQuery.querySelectorAll(root, 'input, textarea').filter(isTextControl);
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
  async write(root, value, options) {
    const el = findControl(root);
    if (!el) throw new AdapterError(t('adTextNotFound'), 'control-not-found');
    if (el.readOnly || el.disabled) {
      throw new AdapterError(t('adReadOnlyOrDisabled'), 'write-failed');
    }
    if (options?.typing) {
      await typeText(
        el,
        value,
        options.typing.keyDelayMs,
        options.sleep ?? defaultSleep,
        options.aborted,
      );
      return;
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
  verify(root, value, options) {
    return valueMatches(this.read(root), value, options?.typing !== undefined);
  },
};
