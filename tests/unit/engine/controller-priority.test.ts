import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRule, type Rule, type RunReport } from '../../../src/core/model';
import { createController, type Controller } from '../../../src/core/engine';

const SETTLE = 100;
const BASE = 'https://exemplo.com/p/1';

function makeRule(o: {
  id: string;
  value: string;
  priority?: number;
  enabled?: boolean;
  mode?: 'auto' | 'button';
  selector?: string;
  label?: string;
  fields?: { id: string; label: string; value: string }[];
}): Rule {
  const r = parseRule({
    id: o.id,
    name: `Regra ${o.id}`,
    enabled: o.enabled ?? true,
    ...(o.priority !== undefined ? { priority: o.priority } : {}),
    trigger: {
      urlPatterns: ['https://exemplo.com/p/*'],
      container: { selector: o.selector ?? '.modal' },
      settleMs: SETTLE,
    },
    behavior: { mode: o.mode ?? 'auto', overwrite: 'always' },
    fields: (o.fields ?? [{ id: 'a', label: o.label ?? 'Campo A', value: o.value }]).map((f) => ({
      id: f.id,
      locator: { by: 'label', text: f.label },
      value: f.value,
    })),
    updatedAt: '2026-11-13T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.rule;
}

function addModal(cls = 'modal', id = 'm'): HTMLElement {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = `<div><label>Campo A</label><input id="${id}-a" type="text"></div>
    <div><label>Campo B</label><input id="${id}-b" type="text"></div>`;
  document.body.appendChild(el);
  return el;
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('várias regras no mesmo contêiner', () => {
  let controller: Controller | undefined;
  const reports: RunReport[] = [];
  const buttons = new Map<string, () => void>();

  function make(rules: Rule[]): Controller {
    controller = createController({
      window,
      rules,
      onReport: (r) => reports.push(r),
      ui: {
        showReport: vi.fn(),
        highlight: vi.fn(),
        showActionButton: (id, _l, cb) => void buttons.set(id, cb),
        hideActionButton: (id) => void buttons.delete(id),
      },
    });
    controller.start();
    return controller;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    reports.length = 0;
    buttons.clear();
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(BASE);
  });
  afterEach(() => {
    controller?.stop();
    controller = undefined;
    vi.useRealTimers();
  });

  const reportOf = (id: string) => reports.find((r) => r.ruleId === id);

  it('a de maior prioridade preenche; a outra registra o motivo', async () => {
    // A de menor prioridade vem primeiro na configuração.
    make([
      makeRule({ id: 'baixa', value: 'baixa', priority: 10 }),
      makeRule({ id: 'alta', value: 'alta', priority: 90 }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('m-a').value).toBe('alta');
    expect(reportOf('alta')?.fields[0]?.outcome).toBe('filled');
    const skipped = reportOf('baixa')?.fields[0];
    expect(skipped?.outcome).toBe('skipped-already-handled');
    expect(skipped?.message).toBe('preenchido pela regra Regra alta');
    // A ordem de execução foi por prioridade.
    expect(reports.map((r) => r.ruleId)).toEqual(['alta', 'baixa']);
  });

  it('empate segue a ordem das regras na configuração', async () => {
    make([
      makeRule({ id: 'x', value: 'x', priority: 50 }),
      makeRule({ id: 'y', value: 'y' }), // ausente = 50
    ]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('m-a').value).toBe('x');
    expect(reportOf('y')?.fields[0]?.message).toBe('preenchido pela regra Regra x');
  });

  it('prioridade ausente vale 50 (10 perde, 60 ganha)', async () => {
    make([
      makeRule({ id: 'p10', value: 'p10', priority: 10 }),
      makeRule({ id: 'neutra', value: 'neutra' }),
      makeRule({ id: 'p60', value: 'p60', priority: 60 }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('m-a').value).toBe('p60');
    expect(reports.map((r) => r.ruleId)).toEqual(['p60', 'neutra', 'p10']);
  });

  it('regra desligada não participa', async () => {
    make([
      makeRule({ id: 'off', value: 'off', priority: 100, enabled: false }),
      makeRule({ id: 'on', value: 'on', priority: 1 }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('m-a').value).toBe('on');
    expect(reportOf('off')).toBeUndefined();
    expect(reportOf('on')?.fields[0]?.outcome).toBe('filled');
  });

  it('campos diferentes não conflitam: ambas preenchem', async () => {
    make([
      makeRule({ id: 'a', value: 'va', priority: 80 }),
      makeRule({ id: 'b', value: 'vb', label: 'Campo B', priority: 20 }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('m-a').value).toBe('va');
    expect(input('m-b').value).toBe('vb');
  });

  it('contêineres diferentes rodam em paralelo (sem fila entre eles)', async () => {
    const slow = makeRule({
      id: 'lenta',
      value: 'lenta',
      selector: '.um',
      priority: 90,
    });
    const slowWithDelay = parseRule({
      ...slow,
      fields: [{ ...slow.fields[0], delayMs: 2000 }],
    });
    if (!slowWithDelay.ok) throw new Error(slowWithDelay.errors.join('; '));
    make([slowWithDelay.rule, makeRule({ id: 'rapida', value: 'rapida', selector: '.dois' })]);
    addModal('um', 'u');
    addModal('dois', 'd');
    await tick(SETTLE + 100);
    // A rápida (outro contêiner) já preencheu enquanto a lenta ainda espera o atraso.
    expect(input('d-a').value).toBe('rapida');
    expect(input('u-a').value).toBe('');
    await tick(2100);
    expect(input('u-a').value).toBe('lenta');
  });

  it('desfazer de uma regra só restaura os campos dela', async () => {
    make([
      makeRule({
        id: 'a',
        value: 'va',
        priority: 80,
        fields: [{ id: 'a', label: 'Campo A', value: 'va' }],
      }),
      makeRule({ id: 'b', value: 'vb', label: 'Campo B', priority: 20 }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    await controller?.undo('a');
    expect(input('m-a').value).toBe('');
    expect(input('m-b').value).toBe('vb');
  });

  it('após desfazer a vencedora, a reivindicação é liberada (botão da outra preenche)', async () => {
    make([
      makeRule({ id: 'alta', value: 'alta', priority: 90 }),
      makeRule({ id: 'baixa', value: 'baixa', priority: 10, mode: 'button' }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    expect(input('m-a').value).toBe('alta');
    buttons.get('baixa')?.();
    await tick(10);
    // Ainda reivindicado pela 'alta'.
    expect(input('m-a').value).toBe('alta');
    await controller?.undo('alta');
    expect(input('m-a').value).toBe('');
    await controller?.runNow('baixa');
    expect(input('m-a').value).toBe('baixa');
  });

  it('nova aparição do contêiner limpa as reivindicações', async () => {
    make([
      makeRule({ id: 'alta', value: 'alta', priority: 90 }),
      makeRule({ id: 'baixa', value: 'baixa', priority: 10 }),
    ]);
    const el = addModal();
    await tick(SETTLE + 50);
    el.remove();
    await tick(SETTLE + 50);
    reports.length = 0;
    addModal('modal', 'n');
    await tick(SETTLE + 50);
    expect(input('n-a').value).toBe('alta');
    expect(reportOf('alta')?.fields[0]?.outcome).toBe('filled');
    expect(reportOf('baixa')?.fields[0]?.outcome).toBe('skipped-already-handled');
  });

  it('botões: cliques no mesmo contêiner preenchem em sequência', async () => {
    make([
      makeRule({ id: 'b1', value: 'b1', mode: 'button' }),
      makeRule({ id: 'b2', value: 'b2', mode: 'button' }),
    ]);
    addModal();
    await tick(SETTLE + 50);
    buttons.get('b2')?.();
    buttons.get('b1')?.();
    await tick(50);
    expect(input('m-a').value).toBe('b2');
    expect(reportOf('b1')?.fields[0]?.message).toBe('preenchido pela regra Regra b2');
  });
});
