import { ExpressionError, type LocalDateTime } from './types';

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Converte um instante para data/hora de parede no fuso informado. */
export function toLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new ExpressionError(`Fuso horário inválido: "${timeZone}"`, 0);
  }
  if (Number.isNaN(instant.getTime())) {
    throw new ExpressionError('Data atual inválida', 0);
  }
  const parts = fmt.formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  return { y: get('year'), m: get('month'), d: get('day'), H: get('hour') % 24, mi: get('minute') };
}

/** Interpreta `YYYY-MM-DD` ou `DD/MM/YYYY`. Retorna null se não for data real. */
export function parseDateText(text: string): LocalDateTime | null {
  const s = text.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if ((match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) {
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d, H: 0, mi: 0 };
}

export function addDays(dt: LocalDateTime, n: number): LocalDateTime {
  const t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + n));
  return { ...dt, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Soma meses limitando o dia ao último do mês de destino (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(dt: LocalDateTime, n: number): LocalDateTime {
  const total = dt.y * 12 + (dt.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (((total % 12) + 12) % 12) + 1;
  return { ...dt, y, m, d: Math.min(dt.d, daysInMonth(y, m)) };
}

export function startOfMonth(dt: LocalDateTime): LocalDateTime {
  return { ...dt, d: 1 };
}

export function endOfMonth(dt: LocalDateTime): LocalDateTime {
  return { ...dt, d: daysInMonth(dt.y, dt.m) };
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

/** Formata com os tokens DD, MM, YYYY, YY, HH, mm. Demais caracteres ficam como estão. */
export function formatDate(dt: LocalDateTime, format: string): string {
  return format.replace(/YYYY|YY|DD|MM|HH|mm/g, (token) => {
    switch (token) {
      case 'YYYY':
        return pad(dt.y, 4);
      case 'YY':
        return pad(dt.y % 100);
      case 'DD':
        return pad(dt.d);
      case 'MM':
        return pad(dt.m);
      case 'HH':
        return pad(dt.H);
      default:
        return pad(dt.mi);
    }
  });
}
