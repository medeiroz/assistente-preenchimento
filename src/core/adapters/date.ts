import { AdapterError, type FieldAdapter } from './types';
import { defaultSleep, dispatch, setNativeValue, typeText, valueMatches } from './dom';
import { deepQuery } from '../locator/deep-query';

/** Controle de data (input[type=date], .eui-input-datepicker, máscara dd/mm/aaaa, data-date-format). */
export function isDateControl(el: Element): el is HTMLInputElement {
  if (el.tagName !== 'INPUT') return false;
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  const placeholder = (el.getAttribute('placeholder') ?? '').toLowerCase();
  const hasDatepickerClass = Array.from(el.classList).some((c) =>
    c.toLowerCase().includes('datepicker'),
  );
  const provider = (el.getAttribute('data-provide') ?? '').toLowerCase();
  const toggle = (el.getAttribute('data-toggle') ?? '').toLowerCase();
  return (
    type === 'date' ||
    el.classList.contains('eui-input-datepicker') ||
    hasDatepickerClass || // inclui jQuery UI (hasDatepicker)
    provider === 'datepicker' ||
    toggle === 'datepicker' ||
    el.hasAttribute('data-datepicker') ||
    placeholder.includes('dd/mm/aaaa') ||
    placeholder.includes('dd/mm/yyyy') ||
    el.hasAttribute('data-date-format')
  );
}

function findInput(root: Element): HTMLInputElement | null {
  if (deepQuery.querySelector(root, '.multiselect')) return null;
  const candidates = root.matches('input') ? [root] : deepQuery.querySelectorAll(root, 'input');
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

/**
 * Datepickers costumam marcar o input como readonly para forçar a escolha pelo
 * calendário; por isso, ao contrário do texto comum, readonly é permitido em
 * datas (o valor é definido programaticamente). Só desabilitado é recusado.
 */
function assertEnabled(el: HTMLInputElement): void {
  if (el.disabled) throw new AdapterError('Controle desabilitado', 'write-failed');
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
  async write(root, value, options) {
    const el = findInput(root);
    if (!el) throw new AdapterError('Campo de data não encontrado', 'control-not-found');
    const parsed = parseDate(value);
    if (!parsed) {
      throw new AdapterError(
        `Data inválida: "${value}" (use DD/MM/YYYY ou YYYY-MM-DD)`,
        'write-failed',
      );
    }
    assertEnabled(el);
    const native = (el.getAttribute('type') ?? '').toLowerCase() === 'date';
    if (options?.typing && !native && !el.readOnly) {
      await typeText(
        el,
        toBr(parsed),
        options.typing.keyDelayMs,
        options.sleep ?? defaultSleep,
        options.aborted,
      );
      return;
    }
    el.focus();
    setNativeValue(el, native ? toIso(parsed) : toBr(parsed));
    dispatch(el, 'input');
    dispatch(el, 'change');
    el.blur();
  },
  async clear(root) {
    const el = findInput(root);
    if (!el) throw new AdapterError('Campo de data não encontrado', 'control-not-found');
    assertEnabled(el);
    el.focus();
    setNativeValue(el, '');
    dispatch(el, 'input');
    dispatch(el, 'change');
    el.blur();
  },
  verify(root, value, options) {
    const parsed = parseDate(value);
    return (
      parsed !== null && valueMatches(this.read(root), toBr(parsed), options?.typing !== undefined)
    );
  },
};
