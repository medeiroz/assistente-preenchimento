import { describe, expect, it } from 'vitest';
import {
  createFrameRegistry,
  createFramesBackground,
  type SessionArea,
} from '../../../src/core/frames';
import type { RunReport } from '../../../src/core/model';
import type { Message } from '../../../src/shared/messages';

function session(): SessionArea {
  const data = new Map<string, unknown>();
  return {
    get: (k) => Promise.resolve(data.has(k) ? { [k]: data.get(k) } : {}),
    set: (items) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
      return Promise.resolve();
    },
    remove: (k) => {
      data.delete(k);
      return Promise.resolve();
    },
  };
}

const report: RunReport = {
  ruleId: 'r',
  ruleName: 'Regra',
  startedAt: '2026-01-01T00:00:00.000Z',
  url: 'http://x/',
  origin: 'auto',
  fields: [],
};

function setup(over: { sendToFrame?: () => Promise<unknown> } = {}) {
  const sent: { tabId: number; frameId: number | 'all'; message: Message }[] = [];
  const bg = createFramesBackground({
    registry: createFrameRegistry({ session: session() }),
    sendToFrame: (tabId, frameId, message) => {
      sent.push({ tabId, frameId, message });
      return over.sendToFrame ? over.sendToFrame() : Promise.resolve(undefined);
    },
    broadcast: (tabId, message) => {
      sent.push({ tabId, frameId: 'all', message });
      return Promise.resolve(undefined);
    },
    pausedHosts: () => Promise.resolve(['pausado.com']),
  });
  const hello = (tabId: number, frameId: number, url: string, tabUrl?: string) =>
    bg.handle(
      { type: 'frame/hello', payload: { url, activeRules: [], lastReport: null } },
      { tabId, frameId, ...(tabUrl ? { tabUrl } : {}) },
    );
  return { bg, sent, hello };
}

describe('background dos frames', () => {
  it('hello registra e responde com a URL da aba, quando conhecida', async () => {
    const { bg, hello } = setup();
    expect(await hello(1, 0, 'https://a.com/', 'https://a.com/')).toEqual({
      topUrl: 'https://a.com/',
    });
    expect(await hello(1, 2, 'https://w.com/')).toEqual({});
    const agg = await bg.handle({ type: 'tab/frames', payload: { tabId: 1 } }, {});
    expect(agg).toMatchObject({ host: 'a.com', paused: false });
    expect((agg as { frames: unknown[] }).frames).toHaveLength(2);
  });

  it('tab/frames usa os hosts pausados da configuração', async () => {
    const { bg, hello } = setup();
    await hello(1, 0, 'https://pausado.com/');
    expect(await bg.handle({ type: 'tab/frames', payload: { tabId: 1 } }, {})).toMatchObject({
      paused: true,
    });
  });

  it('bye de um frame filho remove o registro e avisa o topo', async () => {
    const { bg, hello, sent } = setup();
    await hello(1, 0, 'https://a.com/');
    await hello(1, 5, 'https://w.com/');
    await bg.handle({ type: 'frame/bye', payload: {} }, { tabId: 1, frameId: 5 });
    const agg = (await bg.handle({ type: 'tab/frames', payload: { tabId: 1 } }, {})) as {
      frames: { frameId: number }[];
    };
    expect(agg.frames.map((f) => f.frameId)).toEqual([0]);
    expect(sent).toEqual([
      { tabId: 1, frameId: 0, message: { type: 'ui/frame-gone', payload: { frameId: 5 } } },
    ]);
  });

  it('aba fechada e navegação do topo limpam o registro', async () => {
    const { bg, hello } = setup();
    await hello(1, 0, 'https://a.com/');
    await hello(2, 0, 'https://b.com/');
    await bg.tabUpdated(1, { status: 'loading', url: 'https://c.com/' });
    await bg.tabRemoved(2);
    for (const tabId of [1, 2]) {
      const agg = (await bg.handle({ type: 'tab/frames', payload: { tabId } }, {})) as {
        frames: unknown[];
      };
      expect(agg.frames).toEqual([]);
    }
  });

  it('toast do filho vai ao topo (com o frameId de origem) quando o topo tem motor', async () => {
    const { bg, hello, sent } = setup();
    await hello(1, 0, 'https://a.com/');
    const ok = await bg.handle(
      { type: 'ui/toast', payload: { report, canUndo: true } },
      { tabId: 1, frameId: 7 },
    );
    expect(ok).toBe(true);
    expect(sent).toEqual([
      {
        tabId: 1,
        frameId: 0,
        message: { type: 'ui/toast', payload: { report, canUndo: true, frameId: 7 } },
      },
    ]);
  });

  it('sem motor no topo (ou do próprio topo) o relay responde false e nada é enviado', async () => {
    const { bg, hello, sent } = setup();
    const toast = { type: 'ui/toast', payload: { report, canUndo: false } } as const;
    expect(await bg.handle(toast, { tabId: 1, frameId: 7 })).toBe(false);
    await hello(1, 0, 'https://a.com/');
    expect(await bg.handle(toast, { tabId: 1, frameId: 0 })).toBe(false);
    expect(
      await bg.handle(
        { type: 'ui/button', payload: { id: 'x', label: 'L', shown: true } },
        { tabId: 2, frameId: 3 },
      ),
    ).toBe(false);
    expect(sent).toEqual([]);
  });

  it('falha ao entregar no topo responde false (o frame mostra sozinho)', async () => {
    const { bg, hello } = setup({ sendToFrame: () => Promise.reject(new Error('sem receptor')) });
    await hello(1, 0, 'https://a.com/');
    expect(
      await bg.handle(
        { type: 'ui/button', payload: { id: 'x', label: 'L', shown: true } },
        { tabId: 1, frameId: 2 },
      ),
    ).toBe(false);
  });

  it('botão do filho vai ao topo e o clique volta ao frame certo, só se vier do topo', async () => {
    const { bg, hello, sent } = setup();
    await hello(1, 0, 'https://a.com/');
    await bg.handle(
      { type: 'ui/button', payload: { id: 'r1', label: 'Preencher', shown: true } },
      { tabId: 1, frameId: 4 },
    );
    expect(sent[0]).toMatchObject({
      frameId: 0,
      message: { type: 'ui/button', payload: { id: 'r1', frameId: 4, shown: true } },
    });

    const action = {
      type: 'ui/action',
      payload: { frameId: 4, kind: 'button', id: 'r1' },
    } as const;
    await bg.handle(action, { tabId: 1, frameId: 3 }); // de um filho: ignorado
    expect(sent).toHaveLength(1);
    await bg.handle(action, { tabId: 1, frameId: 0 });
    expect(sent[1]).toEqual({ tabId: 1, frameId: 4, message: action });
  });

  it('picker/stop é repassado a todos os frames da aba', async () => {
    const { bg, sent } = setup();
    await bg.handle({ type: 'picker/stop' }, { tabId: 3, frameId: 2 });
    expect(sent).toEqual([{ tabId: 3, frameId: 'all', message: { type: 'picker/stop' } }]);
  });

  it('ignora o que não é dos frames', () => {
    const { bg } = setup();
    expect(bg.handle({ type: 'config/get' }, { tabId: 1 })).toBeNull();
  });
});
