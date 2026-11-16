import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunReport } from '../../../src/core/model';
import type { TabStatusAggregate } from '../../../src/shared/messages';
import {
  latestReport,
  sendToFrames,
  stateFromAggregate,
  stateFromTopStatus,
} from '../../../src/entrypoints/popup/lib/frames';
import { sendToFrame, sendToTab } from '../../../src/entrypoints/popup/lib/tab';

const rep = (startedAt: string, name = 'R'): RunReport => ({
  ruleId: 'r',
  ruleName: name,
  startedAt,
  url: 'http://x/',
  origin: 'auto',
  fields: [],
});

const agg: TabStatusAggregate = {
  host: 'a.com',
  paused: false,
  frames: [
    {
      frameId: 0,
      url: 'https://a.com/',
      host: 'a.com',
      paused: false,
      activeRules: [{ id: 'topo', name: 'Topo', mode: 'auto' }],
      lastReport: rep('2026-01-01T00:00:00.000Z', 'Velho'),
    },
    {
      frameId: 3,
      url: 'https://w.com/',
      host: 'a.com',
      paused: false,
      activeRules: [{ id: 'filho', name: 'Filho', mode: 'button' }],
      lastReport: rep('2026-01-02T00:00:00.000Z', 'Novo'),
    },
    {
      frameId: 8,
      url: 'https://x.com/',
      host: 'a.com',
      paused: false,
      activeRules: [],
      lastReport: null,
    },
  ],
};

describe('estado do popup a partir dos frames', () => {
  it('lista as regras de todos os frames com o frame de cada uma e o relatório mais recente', () => {
    const s = stateFromAggregate(agg);
    expect(s?.status.activeRules).toEqual([
      { id: 'topo', name: 'Topo', mode: 'auto', frameId: 0 },
      { id: 'filho', name: 'Filho', mode: 'button', frameId: 3 },
    ]);
    expect(s?.report?.ruleName).toBe('Novo');
    expect(s?.status.host).toBe('a.com');
  });

  it('só os frames com regra ativa recebem "Preencher agora" e "Desfazer"', () => {
    expect(stateFromAggregate(agg)?.targets).toEqual([0, 3]);
  });

  it('sem frames registrados devolve null (o popup cai no tab/status do topo)', () => {
    expect(stateFromAggregate({ host: '', paused: false, frames: [] })).toBeNull();
  });

  it('caminho antigo: o status do frame de topo vira o estado, alvo só o frame 0', () => {
    const s = stateFromTopStatus({
      host: 'a.com',
      paused: true,
      activeRules: [{ id: 'r', name: 'R', mode: 'auto' }],
      lastReport: null,
    });
    expect(s.targets).toEqual([0]);
    expect(s.status.activeRules[0]?.frameId).toBe(0);
    expect(s.status.paused).toBe(true);
  });

  it('latestReport ignora nulos', () => {
    expect(latestReport([null, null])).toBeNull();
    expect(latestReport([rep('2026-01-01T00:00:00.000Z', 'a'), null])?.ruleName).toBe('a');
  });
});

describe('roteamento por frame', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sendToFrame usa tabs.sendMessage com { frameId }; sem frameId, a mensagem vai à aba', async () => {
    const sendMessage = vi.fn(() => Promise.resolve('ok'));
    vi.stubGlobal('browser', { tabs: { sendMessage } });
    await sendToFrame(7, 3, { type: 'run/now', payload: {} });
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'run/now', payload: {} }, { frameId: 3 });
    await sendToTab(7, { type: 'run/last-report' });
    expect(sendMessage).toHaveBeenLastCalledWith(7, { type: 'run/last-report' });
  });

  it('sendToFrames envia a cada frame, tolera falhas parciais e falha se todos falham', async () => {
    const seen: number[] = [];
    const ok = await sendToFrames([0, 3, 5], (f) => {
      seen.push(f);
      return f === 3 ? Promise.reject(new Error('sem iframe')) : Promise.resolve(f);
    });
    expect(seen).toEqual([0, 3, 5]);
    expect(ok).toEqual([0, 5]);
    await expect(sendToFrames([1, 2], () => Promise.reject(new Error('nada')))).rejects.toThrow(
      'nada',
    );
    expect(await sendToFrames([], () => Promise.resolve(1))).toEqual([]);
  });
});
