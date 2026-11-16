import { AdapterError, type FieldAdapter } from './types';
import { dispatch, normalizeSpaces, waitFor } from './dom';
import { deepQuery } from '../locator/deep-query';
import { t } from '../i18n';

const WAIT_MS = 1000;

function isSelect2(el: Element): el is HTMLSelectElement {
  return el.tagName === 'SELECT' && el.classList.contains('select2-hidden-accessible');
}

/** O `<select>` oculto do Select2 (single). A raiz pode ser o select ou o `.select2-container`. */
function findSelect(root: Element): HTMLSelectElement | null {
  if (root.matches('.select2-container')) {
    const prev = root.previousElementSibling;
    return prev && isSelect2(prev) && !prev.multiple ? prev : null;
  }
  const all = isSelect2(root)
    ? [root]
    : deepQuery.querySelectorAll(root, 'select.select2-hidden-accessible').filter(isSelect2);
  const only = all[0];
  return all.length === 1 && only && !only.multiple ? only : null;
}

function containerOf(select: HTMLSelectElement): Element | null {
  const next = select.nextElementSibling;
  return next?.classList.contains('select2-container') ? next : null;
}

function renderedText(select: HTMLSelectElement): string | null {
  const rendered = containerOf(select)?.querySelector('.select2-selection__rendered');
  if (!rendered) return null;
  const clone = rendered.cloneNode(true) as Element;
  clone
    .querySelectorAll('.select2-selection__placeholder, .select2-selection__clear')
    .forEach((n) => n.remove());
  const text = normalizeSpaces(clone.textContent);
  return text === '' ? null : text;
}

function findOption(select: HTMLSelectElement, wanted: string): HTMLOptionElement | null {
  const options = Array.from(select.options);
  return (
    options.find((o) => normalizeSpaces(o.textContent) === wanted) ??
    options.find((o) => o.value === wanted) ??
    null
  );
}

export const select2Adapter: FieldAdapter = {
  id: 'select2',
  detect: (root) => findSelect(root) !== null,
  read(root) {
    const select = findSelect(root);
    return select ? renderedText(select) : null;
  },
  isDefault(root, defaultValue) {
    const current = this.read(root);
    return defaultValue === undefined ? current === null : current === defaultValue;
  },
  async write(root, value) {
    const select = findSelect(root);
    if (!select) throw new AdapterError(t('adSelect2NotFound'), 'control-not-found');
    if (select.disabled) throw new AdapterError(t('adSelect2Disabled'), 'write-failed');
    const option = findOption(select, normalizeSpaces(value));
    if (!option) throw new AdapterError(t('adOptionNotFound', value), 'option-not-found');

    select.value = option.value;
    // O Select2 escuta `change` via jQuery, que também recebe o evento nativo.
    dispatch(select, 'change', { cancelable: false });
    const expected = normalizeSpaces(option.textContent);
    await waitFor(() => renderedText(select) === expected, WAIT_MS);
    if (renderedText(select) !== expected) {
      throw new AdapterError(t('adLabelNotChanged'), 'write-failed');
    }
  },
  async clear(root) {
    const select = findSelect(root);
    if (!select) throw new AdapterError(t('adSelect2NotFound'), 'control-not-found');
    if (select.disabled) throw new AdapterError(t('adSelect2Disabled'), 'write-failed');
    if (renderedText(select) === null) return;
    const empty = Array.from(select.options).find((o) => o.value === '');
    if (empty) select.value = '';
    else select.selectedIndex = -1;
    dispatch(select, 'change', { cancelable: false });
    await waitFor(() => renderedText(select) === null, WAIT_MS);
    if (renderedText(select) !== null) {
      throw new AdapterError(t('adCannotClearSelection'), 'write-failed');
    }
  },
  verify(root, value) {
    const select = findSelect(root);
    if (!select) return false;
    const rendered = renderedText(select);
    const option = findOption(select, normalizeSpaces(value));
    return rendered !== null && option !== null && rendered === normalizeSpaces(option.textContent);
  },
};
