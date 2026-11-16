import { isolateEvents } from '../page-ui/shared';
import { t } from '../../../core/i18n';

export const PICKER_HOST_ATTR = 'data-assistente-captura';

const STYLE = `
:host { all: initial; }
.bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px;
  padding: 10px 16px; background: #1d4ed8; color: #fff;
  font: 600 14px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.msg { margin: 0; }
.note { margin: 0; font-weight: 500; color: #fde68a; }
.cancel {
  all: unset; cursor: pointer; padding: 5px 12px; border-radius: 6px;
  background: #fff; color: #1d4ed8; font-weight: 700;
}
.cancel:hover { background: #dbeafe; }
.cancel:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.box {
  position: fixed; display: none; box-sizing: border-box; pointer-events: none;
  z-index: 2147483646; border: 2px solid #22c55e; border-radius: 4px;
  background: rgba(34, 197, 94, 0.15);
}
.tag {
  position: fixed; display: none; pointer-events: none; z-index: 2147483647;
  max-width: min(420px, calc(100vw - 16px)); padding: 3px 8px; border-radius: 4px;
  background: #111827; color: #f9fafb; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;
  font: 600 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
`;

const BAR_HEIGHT = 56;

export interface Overlay {
  /** O evento veio de dentro do overlay (botão Cancelar): não deve ser interceptado. */
  owns(ev: Event): boolean;
  /** Retângulo (coordenadas da viewport) + etiqueta; `null` esconde. */
  highlight(rect: DOMRect | null, text: string): void;
  /** Aviso curto na faixa (ou `null` para limpar). */
  notify(text: string | null): void;
  destroy(): void;
}

/**
 * `compact`: sem a faixa de instruções (frame filho: a faixa fica no frame de topo e cobriria o
 * conteúdo de um iframe pequeno). Os avisos passam a aparecer na etiqueta.
 */
export function createOverlay(doc: Document, onCancel: () => void, compact = false): Overlay {
  const host = doc.createElement('div');
  host.setAttribute(PICKER_HOST_ATTR, '');
  isolateEvents(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = STYLE;

  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', t('pickerAria'));
  const msg = doc.createElement('p');
  msg.className = 'msg';
  msg.textContent = t('pickerPrompt');
  const note = doc.createElement('p');
  note.className = 'note';
  note.setAttribute('role', 'status');
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'cancel';
  cancel.textContent = t('cancel');
  cancel.addEventListener('click', onCancel);
  bar.append(msg, note, cancel);

  const box = doc.createElement('div');
  box.className = 'box';
  const tag = doc.createElement('div');
  tag.className = 'tag';

  shadow.append(style, box, tag);
  if (!compact) shadow.append(bar);
  (doc.body ?? doc.documentElement).append(host);

  return {
    owns: (ev) => ev.composedPath().includes(host),
    highlight(rect, text) {
      if (!rect) {
        box.style.display = 'none';
        tag.style.display = 'none';
        return;
      }
      box.style.display = 'block';
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      tag.textContent = text;
      tag.style.display = 'block';
      tag.style.left = `${Math.max(4, rect.left)}px`;
      const above = rect.top - 26;
      tag.style.top = `${above >= (compact ? 0 : BAR_HEIGHT) ? above : rect.bottom + 4}px`;
    },
    notify(text) {
      if (!compact) {
        note.textContent = text ?? '';
        return;
      }
      if (text === null) return void (tag.style.display = 'none');
      tag.textContent = text;
      tag.style.display = 'block';
      tag.style.left = '4px';
      tag.style.top = '4px';
    },
    destroy() {
      cancel.removeEventListener('click', onCancel);
      host.remove();
    },
  };
}
