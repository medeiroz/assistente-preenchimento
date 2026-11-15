import { AdapterError, type FieldAdapter } from './types';
import { dispatch, normalizeSpaces, setNativeValue, waitFor } from './dom';
import { deepQuery } from '../locator/deep-query';

const WAIT_MS = 1000;

// react-select v5: sem `classNamePrefix` as classes são `css-<hash>-control`; com prefixo,
// `<prefixo>__control`. Os dois formatos são aceitos.
const CONTROL = /(^css-[\w-]+-control$)|(__control$)/;
const SINGLE_VALUE = /(-singleValue$)|(__single-value$)/;
const INDICATOR = /(-indicatorContainer$)|(__indicator$)/;
const CLEAR = /__clear-indicator$/;

const hasClass = (el: Element, re: RegExp): boolean =>
  Array.from(el.classList).some((c) => re.test(c));

function inRoot(root: Element, re: RegExp): HTMLElement[] {
  const all = deepQuery.querySelectorAll(root, '[class]');
  if (root.hasAttribute('class')) all.unshift(root);
  return all.filter((el): el is HTMLElement => hasClass(el, re));
}

interface Parts {
  control: HTMLElement;
  input: HTMLInputElement;
}

function findParts(root: Element): Parts | null {
  const controls = inRoot(root, CONTROL).filter((c) => c.querySelector('input[role="combobox"]'));
  const control = controls[0];
  if (controls.length !== 1 || !control) return null;
  const input = control.querySelector<HTMLInputElement>('input[role="combobox"]');
  return input ? { control, input } : null;
}

function descendants(control: Element, re: RegExp): HTMLElement[] {
  return Array.from(control.querySelectorAll<HTMLElement>('[class]')).filter((el) =>
    hasClass(el, re),
  );
}

/** Botão de limpar: `__clear-indicator` ou, sem prefixo, o primeiro de dois indicadores. */
function findClearIndicator(control: Element): HTMLElement | null {
  const indicators = descendants(control, INDICATOR);
  const byPrefix = indicators.find((el) => hasClass(el, CLEAR));
  if (byPrefix) return byPrefix;
  const first = indicators[0];
  return indicators.length >= 2 && first ? first : null;
}

/** O menu pode estar num portal: localiza pelo `aria-controls`/`aria-owns` do input. */
function findMenu(input: HTMLInputElement): ParentNode | null {
  const tree = input.getRootNode() as Document | ShadowRoot;
  const id = input.getAttribute('aria-controls') ?? input.getAttribute('aria-owns');
  if (id) {
    const byId = tree.getElementById?.(id);
    if (byId) return byId;
  }
  const sel = '[id^="react-select-"][id$="-listbox"]';
  return tree.querySelector(sel) ?? input.ownerDocument.querySelector(sel);
}

function findOption(input: HTMLInputElement, wanted: string): HTMLElement | null {
  const menu = findMenu(input);
  if (!menu) return null;
  for (const option of menu.querySelectorAll<HTMLElement>('[role="option"]')) {
    if (normalizeSpaces(option.textContent) === wanted) return option;
  }
  return null;
}

function resetFilter(input: HTMLInputElement): void {
  if (input.value !== '') {
    setNativeValue(input, '');
    dispatch(input, 'input');
  }
  // blur nativo (não borbulha): o react-select fecha o menu sozinho; nada de teclado sintético.
  input.blur();
}

export const reactSelectAdapter: FieldAdapter = {
  id: 'react-select',
  detect: (root) => findParts(root) !== null,
  read(root) {
    const parts = findParts(root);
    if (!parts) return null;
    const single = descendants(parts.control, SINGLE_VALUE)[0];
    const text = normalizeSpaces(single?.textContent);
    return text === '' ? null : text;
  },
  isDefault(root, defaultValue) {
    const current = this.read(root);
    return defaultValue === undefined ? current === null : current === defaultValue;
  },
  async write(root, value) {
    const parts = findParts(root);
    if (!parts) throw new AdapterError('react-select não encontrado', 'control-not-found');
    const { input } = parts;
    const wanted = normalizeSpaces(value);

    input.focus();
    // O React ignora o setter de instância: usa o do protótipo e avisa com `input`.
    setNativeValue(input, wanted);
    dispatch(input, 'input');

    const option = await waitFor(() => findOption(input, wanted), WAIT_MS);
    if (!option) {
      resetFilter(input);
      throw new AdapterError(`Opção "${value}" não encontrada`, 'option-not-found');
    }
    dispatch(option, 'mousedown');
    dispatch(option, 'mouseup');
    dispatch(option, 'click');
    await waitFor(() => this.read(root) === wanted, WAIT_MS);
    resetFilter(input);
    if (this.read(root) !== wanted) {
      throw new AdapterError('o valor exibido não mudou', 'write-failed');
    }
  },
  async clear(root) {
    const parts = findParts(root);
    if (!parts) throw new AdapterError('react-select não encontrado', 'control-not-found');
    if (this.read(root) === null) return;
    const button = findClearIndicator(parts.control);
    if (!button) throw new AdapterError('o campo não tem botão de limpar', 'write-failed');
    dispatch(button, 'mousedown');
    await waitFor(() => this.read(root) === null, WAIT_MS);
    resetFilter(parts.input);
    if (this.read(root) !== null) {
      throw new AdapterError('não foi possível limpar a seleção', 'write-failed');
    }
  },
  verify(root, value) {
    return this.read(root) === normalizeSpaces(value);
  },
};
