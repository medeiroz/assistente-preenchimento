import { AdapterError, type FieldAdapter } from './types';
import { dispatch, normalizeSpaces, setNativeValue, waitFor } from './dom';

const WAIT_MS = 1000;
const SETTLE_MS = 300;

function findSelect(root: Element): HTMLElement | null {
  return root.matches('.multiselect')
    ? (root as HTMLElement)
    : root.querySelector<HTMLElement>('.multiselect');
}

function isOpen(ms: Element): boolean {
  return ms.classList.contains('multiselect--active');
}

function findOption(ms: Element, value: string): HTMLElement | null {
  const items = ms.querySelectorAll<HTMLElement>('li.multiselect__element');
  for (const li of items) {
    if (li.style.display === 'none') continue;
    const span = li.querySelector<HTMLElement>('span.multiselect__option');
    if (span && normalizeSpaces(span.textContent) === value) return span;
  }
  return null;
}

/**
 * Fecha o dropdown sem teclado sintético: aguarda o fechamento natural (closeOnSelect) e,
 * se ainda estiver aberto, tira o foco (blur nativo não borbulha e o vue-multiselect
 * desativa no blur do input).
 */
async function closeDropdown(ms: HTMLElement): Promise<void> {
  if (await waitFor(() => !isOpen(ms), SETTLE_MS)) return;
  const input = ms.querySelector<HTMLInputElement>('input.multiselect__input');
  const target = input ?? ms;
  if (ms.ownerDocument.activeElement !== target) target.focus();
  target.blur();
  await waitFor(() => !isOpen(ms), WAIT_MS);
}

function openDropdown(ms: HTMLElement): void {
  const input = ms.querySelector<HTMLInputElement>('input.multiselect__input');
  const toggler = ms.querySelector<HTMLElement>('.multiselect__select') ?? ms;
  dispatch(toggler, 'mousedown');
  if (!isOpen(ms)) (input ?? ms).focus();
}

function findClearButton(ms: HTMLElement): HTMLElement | null {
  const btn = ms.querySelector<HTMLElement>('.multiselect__clear');
  if (!btn || btn.hidden || btn.style.display === 'none') return null;
  return btn;
}

function findSelectedOption(ms: Element): HTMLElement | null {
  return ms.querySelector<HTMLElement>(
    'li.multiselect__element span.multiselect__option--selected',
  );
}

export const vueMultiselectAdapter: FieldAdapter = {
  id: 'vue-multiselect',
  detect: (root) => findSelect(root) !== null,
  read(root) {
    const ms = findSelect(root);
    if (!ms) return null;
    const single = ms.querySelector('.multiselect__single');
    if (single) {
      const text = normalizeSpaces(single.textContent);
      return text === '' ? null : text;
    }
    const tags = Array.from(ms.querySelectorAll('.multiselect__tag > span'))
      .map((t) => normalizeSpaces(t.textContent))
      .filter((t) => t !== '');
    return tags.length > 0 ? tags.join(', ') : null;
  },
  isDefault(root, defaultValue) {
    const current = this.read(root);
    return defaultValue === undefined ? current === null : current === defaultValue;
  },
  async write(root, value) {
    const ms = findSelect(root);
    if (!ms) throw new AdapterError('multiselect não encontrado', 'control-not-found');
    const wanted = normalizeSpaces(value);

    openDropdown(ms);
    await waitFor(() => isOpen(ms), WAIT_MS);

    let option = findOption(ms, wanted);
    const input = ms.querySelector<HTMLInputElement>('input.multiselect__input');
    if (!option && input) {
      setNativeValue(input, wanted);
      dispatch(input, 'input');
      option = await waitFor(() => findOption(ms, wanted), WAIT_MS);
    }
    if (!option) {
      await closeDropdown(ms);
      throw new AdapterError(`Opção "${value}" não encontrada`, 'option-not-found');
    }

    dispatch(option, 'mousedown');
    dispatch(option, 'click');
    await waitFor(() => this.read(root) === wanted, WAIT_MS);
    await closeDropdown(ms);
  },
  async clear(root) {
    const ms = findSelect(root);
    if (!ms) throw new AdapterError('multiselect não encontrado', 'control-not-found');
    if (this.read(root) === null) return;

    const button = findClearButton(ms);
    if (button) {
      dispatch(button, 'mousedown');
      dispatch(button, 'click');
      await waitFor(() => this.read(root) === null, WAIT_MS);
    } else {
      // vue-multiselect (allowEmpty padrão): clicar na opção selecionada a desseleciona.
      openDropdown(ms);
      await waitFor(() => isOpen(ms), WAIT_MS);
      for (let i = 0; i < 20 && this.read(root) !== null; i++) {
        const selected = findSelectedOption(ms);
        if (!selected) break;
        dispatch(selected, 'mousedown');
        dispatch(selected, 'click');
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (!isOpen(ms)) openDropdown(ms);
      }
      await waitFor(() => this.read(root) === null, WAIT_MS);
      await closeDropdown(ms);
    }
    if (this.read(root) !== null) {
      throw new AdapterError('não foi possível limpar a seleção', 'write-failed');
    }
  },
  verify(root, value) {
    return this.read(root) === value;
  },
};
