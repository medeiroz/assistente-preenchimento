import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

// Formulário grande fictício: muitos campos rotulados (com ícones dentro do rótulo),
// divs aninhadas, radios e máscaras. Mede o custo do gravador e do localizador no Chromium.

let bundle = '';
test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve(import.meta.dirname, 'entries/perf-entry.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
    logLevel: 'silent',
  });
  const out = result.outputFiles[0];
  if (!out) throw new Error('esbuild não gerou saída');
  bundle = out.text;
});

function bigFormHtml(fields: number): string {
  const icon = '<svg width="12" height="12"><path d="M0 0h12v12z"/></svg><i class="ic"></i>';
  const parts: string[] = [];
  for (let i = 0; i < fields; i++) {
    parts.push(`
      <div class="col"><div class="field"><div class="row">
        <label for="f${i}">Campo fictício ${i} ${icon}</label>
        <div class="ctl"><div class="wrap"><input id="f${i}" name="campo_${i}" type="text" data-mask="000.000.000-00"></div></div>
      </div></div></div>`);
    if (i % 15 === 0) {
      // campo órfão (sem rótulo próprio) no fundo de divs aninhadas, junto de vários rótulos
      const sibs = Array.from(
        { length: 10 },
        (_, j) =>
          `<div class="s"><label for="s${i}_${j}">Irmão ${i}-${j} ${icon}</label><input id="s${i}_${j}"></div>`,
      ).join('');
      parts.push(
        `<div><div><div><div>${sibs}<div><div><input id="o${i}" placeholder="sem rótulo"></div></div></div></div></div></div>`,
      );
    }
    if (i % 10 === 0) {
      parts.push(`
      <fieldset class="field"><legend>Opção ${i}</legend>
        <label><input type="radio" name="op_${i}" value="a"> Sim</label>
        <label><input type="radio" name="op_${i}" value="b"> Não</label>
      </fieldset>`);
    }
  }
  return `<!doctype html><html><body><form><section>${parts.join('')}</section></form></body></html>`;
}

const FIELDS = 150;

test('resolveField + buildCapture em formulário grande ficam dentro do orçamento', async ({
  page,
}) => {
  await page.setContent(bigFormHtml(FIELDS));
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(() => {
    const times: number[] = [];
    for (const id of ['f0', 'f75', 'f149', 'o0', 'o75']) {
      const el = document.getElementById(id) as Element;
      const t0 = performance.now();
      const hit = window.__perf.resolveField(el);
      const cap = window.__perf.buildCapture(el, document, location.href);
      times.push(performance.now() - t0);
      if (!hit || !cap) throw new Error(`sem captura: ${id}`);
    }
    return times;
  });
  console.log('[perf] resolveField+buildCapture (ms):', result.map((n) => n.toFixed(1)).join(', '));
  // Orçamentos com folga para máquinas de CI mais lentas; antes da correção eram ~155 ms por
  // campo e ~11 s para as 30 teclas, então a regressão continua detectada.
  for (const ms of result) expect(ms).toBeLessThan(100);
});

test('30 teclas num campo com 20 campos tocados não travam a página', async ({ page }) => {
  await page.setContent(bigFormHtml(FIELDS));
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(async () => {
    const sent: string[] = [];
    const rec = window.__perf.createRecorder({
      send: (f) => {
        sent.push(f.value);
        return Promise.resolve({ active: true, count: sent.length } as never);
      },
      onStop: () => undefined,
      isTrusted: () => true,
    });
    rec.start({ active: true, count: 0 } as never);

    const fire = (el: Element, type: string, init: EventInit = {}) =>
      el.dispatchEvent(new Event(type, { bubbles: true, composed: true, ...init }));
    const key = (el: Element, type: string, k: string) =>
      el.dispatchEvent(
        new KeyboardEvent(type, { key: k, bubbles: true, composed: true, cancelable: true }),
      );

    let busy = 0;
    const timed = (fn: () => void) => {
      const t0 = performance.now();
      fn();
      busy += performance.now() - t0;
    };

    // 20 campos tocados
    for (let i = 0; i < 20; i++) {
      // metade campos rotulados, metade órfãos (pior caso do localizador)
      const id = i < 10 ? `f${i}` : `o${(i - 10) * 15}`;
      const el = document.getElementById(id) as HTMLInputElement;
      timed(() => {
        fire(el, 'focusin');
        el.value = `${i}`;
        fire(el, 'input');
        fire(el, 'change');
        fire(el, 'focusout');
      });
    }
    // 30 teclas num campo órfão
    const target = document.getElementById('o135') as HTMLInputElement;
    let lastLag = 0;
    let maxLag = 0;
    let last = performance.now();
    const iv = setInterval(() => {
      const n = performance.now();
      maxLag = Math.max(maxLag, n - last - 10);
      last = n;
      lastLag = maxLag;
    }, 10);
    for (let k = 0; k < 30; k++) {
      timed(() => {
        key(target, 'keydown', String(k % 10));
        target.value += String(k % 10);
        fire(target, 'input');
        key(target, 'keyup', String(k % 10));
      });
    }
    await new Promise((r) => setTimeout(r, 1200));
    clearInterval(iv);
    rec.stop();
    return { busy, maxLag: lastLag, sent: sent.length };
  });
  console.log(
    `[perf] 30 teclas: dispatch=${result.busy.toFixed(0)}ms maxLag(timers)=${result.maxLag.toFixed(0)}ms enviados=${result.sent}`,
  );
  expect(result.busy).toBeLessThan(1500);
  expect(result.maxLag).toBeLessThan(1000);
  expect(result.sent).toBeGreaterThan(0);
});
