import { AdapterError, type FieldAdapter } from './types';
import { dispatch, setNativeValue } from './dom';

/** Controle de data (input[type=date], .eui-input-datepicker, máscara dd/mm/aaaa, data-date-format). */
export function isDateControl(el: Element): el is HTMLInputElement {
  if (el.tagName !== 'INPUT') return false;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  return (
    type === 'date' ||
    el.classList.contains('eui-input-datepicker') ||
    (el.getAttribute('placeholder') ?? '').toLowerCase().includes('dd/mm/aaaa') ||
    el.hasAttribute('data-date-format')
  );
}

function findInput(root: Element): HTMLInputElement | null {
  if (root.querySelector('.multiselect')) return null;
  const candidates = root.matches('input') ? [root] : Array.from(root.querySelectorAll('input'));
  return candidates.find(isDateControl) ?? null;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Aceita 'DD/MM/YYYY' ou 'YYYY-MM-DD'; valida data real. */
function parseDate(text: string): Ymd | null {
  const t = text.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const parts = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!parts) return null;
  const [y, m, d] = parts.map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

const toBr = ({ y, m, d }: Ymd) => `${pad(d)}/${pad(m)}/${pad(y, 4)}`;
const toIso = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function normalized(text: string): string {
  const parsed = parseDate(text);
  return parsed ? toBr(parsed) : text;
}

export const dateAdapter: FieldAdapter = {
  id: 'date',
  detect: (root) => findInput(root) !== null,
  read(root) {
    const el = findInput(root);
    return el ? normalized(el.value) : null;
  },
  isDefault(root, defaultValue) {
    const current = this.read(root);
    if (current === null) return false;
    return current === normalized(defaultValue ?? '');
  },
  async write(root, value) {
    const el = findInput(root);
    if (!el) throw new AdapterError('Campo de data não encontrado', 'control-not-found');
    const parsed = parseDate(value);
    if (!parsed) {
      throw new AdapterError(
        `Data inválida: "${value}" (use DD/MM/YYYY ou YYYY-MM-DD)`,
        'write-failed',
      );
    }
    if (el.readOnly || el.disabled) {
      throw new AdapterError('Controle somente leitura ou desabilitado', 'write-failed');
    }
    const native = (el.getAttribute('type') ?? '').toLowerCase() === 'date';
    el.focus();
    setNativeValue(el, native ? toIso(parsed) : toBr(parsed));
    dispatch(el, 'input');
    dispatch(el, 'change');
    el.blur();
  },
  verify(root, value) {
    const parsed = parseDate(value);
    return parsed !== null && this.read(root) === toBr(parsed);
  },
};
