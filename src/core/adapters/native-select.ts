import { AdapterError, type FieldAdapter } from './types';
import { dispatch, normalizeSpaces } from './dom';
import { deepQuery } from '../locator/deep-query';
import { t } from '../i18n';

function findSelect(root: Element): HTMLSelectElement | null {
  if (deepQuery.querySelector(root, '.multiselect')) return null;
  const selects = root.matches('select') ? [root] : deepQuery.querySelectorAll(root, 'select');
  const only = selects[0];
  if (selects.length !== 1 || !only) return null;
  const select = only as HTMLSelectElement;
  return select.multiple ? null : select;
}

function optionText(option: HTMLOptionElement): string {
  return normalizeSpaces(option.textContent);
}

/** Seta selectedIndex pelo setter nativo do protótipo (contorna wrappers de frameworks). */
function setNativeSelectedIndex(select: HTMLSelectElement, index: number): void {
  const view = select.ownerDocument.defaultView;
  const Ctor = view?.HTMLSelectElement ?? HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(Ctor.prototype, 'selectedIndex')?.set;
  if (setter) setter.call(select, index);
  else select.selectedIndex = index;
}

export const nativeSelectAdapter: FieldAdapter = {
  id: 'native-select',
  detect: (root) => findSelect(root) !== null,
  read(root) {
    const select = findSelect(root);
    if (!select) return null;
    const option = select.options[select.selectedIndex];
    if (!option || option.value === '') return null;
    return optionText(option);
  },
  isDefault(root, defaultValue) {
    const select = findSelect(root);
    if (!select) return false;
    if (defaultValue === undefined) {
      const first = select.options[0];
      return this.read(root) === null || (select.selectedIndex === 0 && first?.value === '');
    }
    return this.read(root) === defaultValue;
  },
  async write(root, value) {
    const select = findSelect(root);
    if (!select) throw new AdapterError(t('adSelectNotFound'), 'control-not-found');
    if (select.disabled) throw new AdapterError(t('adSelectDisabled'), 'write-failed');
    const wanted = normalizeSpaces(value);
    const options = Array.from(select.options);
    const byText = options.findIndex((o) => optionText(o) === wanted);
    const index = byText >= 0 ? byText : options.findIndex((o) => o.value === value);
    if (index < 0) {
      throw new AdapterError(t('adOptionNotFound', value), 'option-not-found');
    }
    setNativeSelectedIndex(select, index);
    dispatch(select, 'input');
    dispatch(select, 'change');
  },
  async clear(root) {
    const select = findSelect(root);
    if (!select) throw new AdapterError(t('adSelectNotFound'), 'control-not-found');
    if (select.disabled) throw new AdapterError(t('adSelectDisabled'), 'write-failed');
    const index = Array.from(select.options).findIndex((o) => o.value === '');
    if (index < 0) throw new AdapterError(t('adCannotClear'), 'write-failed');
    setNativeSelectedIndex(select, index);
    dispatch(select, 'input');
    dispatch(select, 'change');
  },
  verify(root, value) {
    const select = findSelect(root);
    const current = this.read(root);
    if (!select || current === null) return false;
    if (current === normalizeSpaces(value)) return true;
    return select.options[select.selectedIndex]?.value === value;
  },
};
