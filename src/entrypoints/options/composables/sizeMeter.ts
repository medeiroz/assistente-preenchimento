/** Fração a partir da qual o medidor entra em alerta. */
export const WARN_RATIO = 0.75;

export type SizeLevel = 'ok' | 'warn' | 'error';

const oneDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const limitFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** "3,1 KB" (uma casa decimal, vírgula). */
export function formatKb(bytes: number): string {
  return `${oneDecimal.format(bytes / 1024)} KB`;
}

/** "8 KB" (sem casa decimal quando o limite é inteiro). */
export function formatLimit(limit: number): string {
  return `${limitFormat.format(limit / 1024)} KB`;
}

/** "3,1 KB de 8 KB". */
export function sizeLabel(bytes: number, limit: number): string {
  return `${formatKb(bytes)} de ${formatLimit(limit)}`;
}

export function sizeLevel(bytes: number, limit: number): SizeLevel {
  if (bytes > limit) return 'error';
  if (bytes >= limit * WARN_RATIO) return 'warn';
  return 'ok';
}
