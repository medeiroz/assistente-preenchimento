import { isolateEvents } from '../page-ui/shared';
import { t } from '../../../core/i18n';

export const RECORDER_HOST_ATTR = 'data-assistente-gravacao';

const STYLE = `
:host { all: initial; }
.bar {
  position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; box-sizing: border-box;
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
  max-width: calc(100vw - 32px); padding: 10px 14px; border-radius: 10px;
  background: #111827; color: #f9fafb;
  font: 600 14px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; flex: none; }
.msg { margin: 0; }
.flash { margin: 0; font-weight: 500; color: #86efac; max-width: 260px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.flash:empty { display: none; }
button {
  all: unset; cursor: pointer; padding: 5px 12px; border-radius: 6px; font-weight: 700;
}
button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.stop { background: #22c55e; color: #052e16; }
.stop:hover { background: #4ade80; }
.discard { background: #374151; color: #f9fafb; }
.discard:hover { background: #4b5563; }
`;

const FLASH_MS = 2500;

export interface RecorderBar {
  /** O evento veio de dentro da barra. */
  owns(ev: Event): boolean;
  setCount(count: number): void;
  flash(text: string): void;
  destroy(): void;
}

function countText(n: number): string {
  return n === 1 ? t('barRecordingOne') : t('barRecordingMany', n);
}

export function createRecorderBar(
  doc: Document,
  handlers: { onStop(): void; onDiscard(): void },
): RecorderBar {
  const host = doc.createElement('div');
  host.setAttribute(RECORDER_HOST_ATTR, '');
  isolateEvents(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = STYLE;

  const bar = doc.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', t('barAria'));
  const dot = doc.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  const msg = doc.createElement('p');
  msg.className = 'msg';
  msg.textContent = countText(0);
  const flashEl = doc.createElement('p');
  flashEl.className = 'flash';
  flashEl.setAttribute('role', 'status');
  const stop = doc.createElement('button');
  stop.type = 'button';
  stop.className = 'stop';
  stop.textContent = t('barStop');
  stop.addEventListener('click', handlers.onStop);
  const discard = doc.createElement('button');
  discard.type = 'button';
  discard.className = 'discard';
  discard.textContent = t('barDiscard');
  discard.addEventListener('click', handlers.onDiscard);
  bar.append(dot, msg, flashEl, stop, discard);

  shadow.append(style, bar);
  (doc.body ?? doc.documentElement).append(host);

  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    owns: (ev) => ev.composedPath().includes(host),
    setCount(count) {
      msg.textContent = countText(count);
    },
    flash(text) {
      flashEl.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(() => {
        flashEl.textContent = '';
      }, FLASH_MS);
    },
    destroy() {
      clearTimeout(timer);
      stop.removeEventListener('click', handlers.onStop);
      discard.removeEventListener('click', handlers.onDiscard);
      host.remove();
    },
  };
}
