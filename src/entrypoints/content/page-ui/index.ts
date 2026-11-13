import type { RunReport } from '../../../core/model';
import { createToast } from './toast';
import { highlight } from './highlight';
import { createActionButtons } from './action-button';

export { createToast, TOAST_HOST_ATTR } from './toast';
export { highlight } from './highlight';
export { createActionButtons, ACTION_HOST_ATTR } from './action-button';

/** UI padrão do controller: toast, destaque dos campos e botões de ação. */
export function createPageUi(): {
  showReport(r: RunReport, actions?: { undo?: () => void }): void;
  highlight(roots: Element[]): void;
  showActionButton(id: string, label: string, onClick: () => void): void;
  hideActionButton(id: string): void;
} {
  const toast = createToast();
  const buttons = createActionButtons();
  return {
    showReport: (r, actions) => toast.show(r, actions),
    highlight,
    showActionButton: buttons.show,
    hideActionButton: buttons.hide,
  };
}
