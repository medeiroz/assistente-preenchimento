import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRule, type Rule, type RunReport } from '../../../src/core/model';
import { createController, type Controller } from '../../../src/core/engine';

const SETTLE = 300;
const BASE = 'https://exemplo.com/nfse/1';

function makeRule(value = '{{ var.x }}', id = 'r1'): Rule {
  const r = parseRule({
    id,
    name: 'Regra de teste',
    trigger: {
      urlPatterns: ['https://exemplo.com/nfse/*'],
      container: { selector: '.modal.is-active', textContains: 'Emitir' },
      settleMs: SETTLE,
    },
    behavior: { mode: 'auto', overwrite: 'onlyIfDefault' },
    fields: [{ id: 'a', locator: { by: 'label', text: 'Campo A' }, value }],
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

const MODAL = `<div class="modal is-active"><h1>Emitir nota</h1>
  <div class="f"><label>Campo A</label><input id="a" type="text" value=""></div></div>`;

function addModal(): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = MODAL;
  const el = tpl.content.firstElementChild as HTMLElement;
  document.body.appendChild(el);
  return el;
}

const input = () => document.getElementById('a') as HTMLInputElement;
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('controller: variáveis, undo e regras ativas', () => {
  let controller: Controller | undefined;
  const showReport = vi.fn<(r: RunReport) => void>();

  function make(rules: Rule[], variables: Record<string, string>): Controller {
    controller = createController({
      window,
      rules,
      variables,
      ui: { showReport, highlight: vi.fn() },
    });
    controller.start();
    return controller;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(BASE);
    showReport.mockReset();
  });

  afterEach(() => {
    controller?.stop();
    controller = undefined;
    vi.useRealTimers();
  });

  it('setVariables muda o valor resolvido na próxima aparição', async () => {
    const c = make([makeRule()], { x: 'um' });
    const modal = addModal();
    await tick(SETTLE + 50);
    expect(input().value).toBe('um');
    c.setVariables({ x: 'dois' });
    modal.remove();
    await tick(50);
    addModal();
    await tick(SETTLE + 50);
    expect(input().value).toBe('dois');
  });

  it('undo restaura o texto anterior e reporta', async () => {
    const c = make([makeRule('fixo')], {});
    addModal();
    await tick(SETTLE + 50);
    expect(input().value).toBe('fixo');
    showReport.mockReset();
    const reports = await c.undo();
    expect(reports).toHaveLength(1);
    expect(input().value).toBe('');
    expect(showReport).toHaveBeenCalledTimes(1);
    expect(await c.undo('outra')).toEqual([]);
  });

  it('activeRules lista regras da URL atual e acompanha setRules', async () => {
    const c = make([makeRule('a', 'r1'), makeRule('b', 'r2')], {});
    expect(c.activeRules().map((r) => r.id)).toEqual(['r1', 'r2']);
    c.setRules([makeRule('a', 'r1')]);
    expect(c.activeRules().map((r) => r.id)).toEqual(['r1']);
    window.history.pushState({}, '', '/fora/1');
    await tick(50);
    expect(c.activeRules()).toEqual([]);
  });

  it('regra alterada reinicia o watcher; regra removida para', async () => {
    const c = make([makeRule('antigo')], {});
    c.setRules([makeRule('novo')]);
    addModal();
    await tick(SETTLE + 50);
    expect(input().value).toBe('novo');
    c.setRules([]);
    input().value = '';
    document.body.innerHTML = '';
    await tick(50);
    addModal();
    await tick(SETTLE + 500);
    expect(input().value).toBe('');
  });
});
