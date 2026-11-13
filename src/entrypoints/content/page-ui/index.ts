import type { RunReport } from '../../../core/model';
import { createToast } from './toast';
import { highlight } from './highlight';

export { createToast, TOAST_HOST_ATTR } from './toast';
export { highlight } from './highlight';

/** UI padrão do controller: toast + destaque dos campos preenchidos. */
export function createPageUi(): {
  showReport(r: RunReport): void;
  highlight(roots: Element[]): void;
} {
  const toast = createToast();
  return { showReport: (r) => toast.show(r), highlight };
}
