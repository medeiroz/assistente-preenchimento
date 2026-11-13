import { AdapterError, type FieldAdapter } from './types';
import { normalizeSpaces, waitFor } from './dom';

type Kind = 'toggle' | 'radio' | 'checkbox';

const ACTIVE_CLASSES = ['is-filled', 'is-active'];
const TRUE_VALUES = new Set(['sim', 'true', '1', 'on']);
const FALSE_VALUES = new Set(['não', 'nao', 'false', '0', 'off']);

function toggleButtons(root: Element): HTMLButtonElement[] {
  const group = root.matches('.eui-button-group') ? root : root.querySelector('.eui-button-group');
  return group ? Array.from(group.querySelectorAll('button')) : [];
}

function isActive(button: Element): boolean {
  return (
    ACTIVE_CLASSES.some((c) => button.classList.contains(c)) ||
    button.getAttribute('aria-pressed') === 'true'
  );
}

function inputs(root: Element, type: string): HTMLInputElement[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>('input')).filter(
    (i) => (i.getAttribute('type') ?? '').toLowerCase() === type,
  );
}

/** Radios do primeiro grupo (mesmo name) com pelo menos 2 membros. */
function radioGroup(root: Element): HTMLInputElement[] {
  const radios = inputs(root, 'radio');
  for (const r of radios) {
    const group = radios.filter((o) => o.name === r.name);
    if (group.length >= 2) return group;
  }
  return [];
}

function kindOf(root: Element): Kind | null {
  if (root.querySelector('.multiselect')) return null;
  if (toggleButtons(root).length >= 2) return 'toggle';
  if (radioGroup(root).length >= 2) return 'radio';
  if (inputs(root, 'checkbox').length === 1) return 'checkbox';
  return null;
}

function labelOf(input: HTMLInputElement): string {
  if (input.id) {
    const byFor = Array.from(input.ownerDocument.querySelectorAll('label')).find(
      (l) => l.htmlFor === input.id,
    );
    if (byFor) return normalizeSpaces(byFor.textContent);
  }
  const ancestor = input.closest('label');
  if (ancestor) return normalizeSpaces(ancestor.textContent);
  return normalizeSpaces(input.getAttribute('aria-label'));
}

function findRadio(root: Element, value: string): HTMLInputElement | undefined {
  const wanted = normalizeSpaces(value);
  const group = radioGroup(root);
  return group.find((r) => labelOf(r) === wanted) ?? group.find((r) => r.value === value);
}

function findButton(root: Element, value: string): HTMLButtonElement | undefined {
  const wanted = normalizeSpaces(value);
  return toggleButtons(root).find((b) => normalizeSpaces(b.textContent) === wanted);
}

/** 'Sim'/'Não' a partir de valores aceitos (case-insensitive); null se inválido. */
function parseBool(value: string): 'Sim' | 'Não' | null {
  const v = value.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return 'Sim';
  if (FALSE_VALUES.has(v)) return 'Não';
  return null;
}

/**
 * Radios, checkbox único e toggle de botões (.eui-button-group).
 * Toggles sempre têm um botão ativo: `isDefault(root)` sem defaultValue devolve false;
 * use `defaultValue` na regra para que o toggle possa ser considerado "padrão".
 */
export const nativeChoiceAdapter: FieldAdapter = {
  id: 'native-choice',
  detect: (root) => kindOf(root) !== null,
  read(root) {
    switch (kindOf(root)) {
      case 'toggle': {
        const active = toggleButtons(root).find(isActive);
        return active ? normalizeSpaces(active.textContent) : null;
      }
      case 'radio': {
        const checked = radioGroup(root).find((r) => r.checked);
        if (!checked) return null;
        const label = labelOf(checked);
        return label === '' ? null : label;
      }
      case 'checkbox':
        return inputs(root, 'checkbox')[0]?.checked ? 'Sim' : 'Não';
      default:
        return null;
    }
  },
  isDefault(root, defaultValue) {
    const kind = kindOf(root);
    if (!kind) return false;
    const current = this.read(root);
    if (kind === 'toggle') return defaultValue !== undefined && current === defaultValue;
    if (kind === 'radio') {
      return defaultValue === undefined ? current === null : current === defaultValue;
    }
    if (defaultValue === undefined) return current === 'Não';
    return current === parseBool(defaultValue);
  },
  async write(root, value) {
    const kind = kindOf(root);
    if (!kind) throw new AdapterError('Controle de escolha não encontrado', 'control-not-found');
    if (kind === 'toggle') {
      const button = findButton(root, value);
      if (!button) throw new AdapterError(`Opção "${value}" não encontrada`, 'option-not-found');
      if (button.disabled) throw new AdapterError('Botão desabilitado', 'write-failed');
      if (!isActive(button)) {
        button.click();
        await waitFor(() => isActive(button), 500);
      }
      return;
    }
    if (kind === 'radio') {
      const radio = findRadio(root, value);
      if (!radio) throw new AdapterError(`Opção "${value}" não encontrada`, 'option-not-found');
      if (radio.disabled) throw new AdapterError('Radio desabilitado', 'write-failed');
      if (!radio.checked) radio.click();
      return;
    }
    const box = inputs(root, 'checkbox')[0];
    const wanted = parseBool(value);
    if (!box || wanted === null) {
      throw new AdapterError(`Valor booleano inválido: "${value}"`, 'write-failed');
    }
    if (box.disabled) throw new AdapterError('Checkbox desabilitado', 'write-failed');
    if (box.checked !== (wanted === 'Sim')) box.click();
  },
  /** Só checkbox: desmarca. Radios e toggles não têm estado "vazio" seguro, então falham. */
  async clear(root) {
    if (kindOf(root) !== 'checkbox') {
      throw new AdapterError('não é possível limpar', 'write-failed');
    }
    const box = inputs(root, 'checkbox')[0];
    if (!box) throw new AdapterError('Checkbox não encontrado', 'control-not-found');
    if (box.disabled) throw new AdapterError('Checkbox desabilitado', 'write-failed');
    if (box.checked) box.click();
  },
  verify(root, value) {
    switch (kindOf(root)) {
      case 'toggle': {
        const button = findButton(root, value);
        return button !== undefined && isActive(button);
      }
      case 'radio':
        return findRadio(root, value)?.checked === true;
      case 'checkbox':
        return this.read(root) === parseBool(value);
      default:
        return false;
    }
  },
};
