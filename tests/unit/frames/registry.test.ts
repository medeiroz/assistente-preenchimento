import { describe, expect, it, vi } from 'vitest';
import { createFrameRegistry, type SessionArea } from '../../../src/core/frames';
import type { RunReport } from '../../../src/core/model';

function fakeSession(): SessionArea & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: (key) => Promise.resolve(data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}),
    set: (items) => {
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v));
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

const report = (ruleName: string): RunReport => ({
  ruleId: 'r',
  ruleName,
  startedAt: '2026-01-01T00:00:00.000Z',
  url: 'http://x/',
  origin: 'auto',
  fields: [],
});

const hello = (url: string, name = 'Regra', over: { topUrl?: string } = {}) => ({
  url,
  ...over,
  activeRules: [{ id: 'r1', name, mode: 'auto' as const }],
  lastReport: null,
});

describe('registro de frames', () => {
  it('guarda frames por aba e frameId e substitui o hello do mesmo frame', async () => {
    const reg = createFrameRegistry({ session: fakeSession() });
    await reg.hello(1, 0, hello('https://a.com/'));
    await reg.hello(1, 3, hello('https://b.com/frame'));
    await reg.hello(2, 0, hello('https://c.com/'));
    await reg.hello(1, 3, { ...hello('https://b.com/frame', 'Nova'), lastReport: report('X') });

    const frames = await reg.frames(1);
    expect(frames.map((f) => f.frameId)).toEqual([0, 3]);
    expect(frames[1]?.activeRules[0]?.name).toBe('Nova');
    expect(frames[1]?.lastReport?.ruleName).toBe('X');
    expect(await reg.frames(2)).toHaveLength(1);
    expect(await reg.has(1, 3)).toBe(true);
    expect(await reg.has(1, 9)).toBe(false);
  });

  it('sobrevive ao worker dormir: o estado vive só na área de sessão', async () => {
    const session = fakeSession();
    await createFrameRegistry({ session }).hello(1, 0, hello('https://a.com/'));
    const reborn = createFrameRegistry({ session });
    expect(await reborn.has(1, 0)).toBe(true);
  });

  it('hellos simultâneos não se perdem', async () => {
    const reg = createFrameRegistry({ session: fakeSession() });
    await Promise.all([1, 2, 3, 4, 5].map((id) => reg.hello(1, id, hello(`https://a.com/${id}`))));
    expect((await reg.frames(1)).map((f) => f.frameId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('bye remove o frame; o último remove a chave', async () => {
    const session = fakeSession();
    const reg = createFrameRegistry({ session });
    await reg.hello(1, 0, hello('https://a.com/'));
    await reg.hello(1, 2, hello('https://b.com/'));
    await reg.bye(1, 2);
    expect((await reg.frames(1)).map((f) => f.frameId)).toEqual([0]);
    await reg.bye(1, 0);
    expect(session.data.size).toBe(0);
    await reg.bye(1, 0); // idempotente
  });

  it('aba fechada limpa tudo da aba', async () => {
    const reg = createFrameRegistry({ session: fakeSession() });
    await reg.hello(1, 0, hello('https://a.com/'));
    await reg.hello(2, 0, hello('https://b.com/'));
    await reg.tabRemoved(1);
    expect(await reg.frames(1)).toEqual([]);
    expect(await reg.frames(2)).toHaveLength(1);
  });

  it('navegação do topo (loading + url) limpa; carregamento sem url ou outros status, não', async () => {
    const reg = createFrameRegistry({ session: fakeSession() });
    await reg.hello(1, 0, hello('https://a.com/'));
    await reg.tabUpdated(1, { status: 'loading' });
    await reg.tabUpdated(1, { status: 'complete', url: 'https://b.com/' });
    await reg.tabUpdated(1, { url: 'https://a.com/#x' });
    expect(await reg.frames(1)).toHaveLength(1);
    await reg.tabUpdated(1, { status: 'loading', url: 'https://b.com/' });
    expect(await reg.frames(1)).toEqual([]);
  });

  it('agrega: host do frame 0, paused pelo host de topo, regras e relatórios de todos os frames', async () => {
    const reg = createFrameRegistry({ session: fakeSession() });
    await reg.hello(1, 0, hello('https://top.com/p'));
    await reg.hello(1, 4, { ...hello('https://widget.com/f'), lastReport: report('Iframe') });
    const agg = await reg.aggregate(1, ['top.com']);
    expect(agg.host).toBe('top.com');
    expect(agg.paused).toBe(true);
    expect(agg.frames.map((f) => [f.frameId, f.url, f.paused])).toEqual([
      [0, 'https://top.com/p', true],
      [4, 'https://widget.com/f', true],
    ]);
    expect(agg.frames[1]?.lastReport?.ruleName).toBe('Iframe');
    expect((await reg.aggregate(1, ['widget.com'])).paused).toBe(false);
  });

  it('sem frame 0: host vem do topUrl do frame, depois da URL da aba', async () => {
    const tabUrl = vi.fn(() => Promise.resolve('https://tab.com/x'));
    const reg = createFrameRegistry({ session: fakeSession(), tabUrl });
    await reg.hello(1, 4, hello('https://widget.com/f', 'R', { topUrl: 'https://top.com/' }));
    expect((await reg.aggregate(1, [])).host).toBe('top.com');
    expect(tabUrl).not.toHaveBeenCalled();

    await reg.hello(2, 4, hello('https://widget.com/f'));
    expect((await reg.aggregate(2, [])).host).toBe('tab.com');
  });

  it('sem nada registrado: frames vazio e host vazio', async () => {
    const reg = createFrameRegistry({ session: fakeSession() });
    expect(await reg.aggregate(9, [])).toEqual({ host: '', paused: false, frames: [] });
  });
});
