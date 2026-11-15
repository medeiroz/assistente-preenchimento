import { describe, expect, it, vi } from 'vitest';
import {
  RECORDER_SESSION_KEY,
  RECORDING_DRAFT_KEY,
  createRecorderBackground,
  parseRecordingDraft,
  type RecorderBackgroundDeps,
} from '../../../src/core/recorder';
import { field } from './helpers';

function area() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (k: string): Promise<Record<string, unknown>> =>
      k in data ? { [k]: structuredClone(data[k]) } : {},
    set: async (items: Record<string, unknown>): Promise<void> => {
      await Promise.resolve();
      Object.assign(data, structuredClone(items));
    },
    remove: async (k: string): Promise<void> => {
      delete data[k];
    },
  };
}

function setup(over: Partial<RecorderBackgroundDeps> = {}) {
  const session = area();
  const local = area();
  const order: string[] = [];
  const deps: RecorderBackgroundDeps = {
    session,
    local: {
      ...local,
      set: async (items) => {
        order.push('draft');
        await local.set(items);
      },
    },
    sendState: vi.fn(async () => undefined),
    openOptions: vi.fn(async () => {
      order.push('options');
    }),
    inject: vi.fn(async () => undefined),
    now: () => 1000,
    ...over,
  };
  return { bg: createRecorderBackground(deps), session, local, deps, order };
}

const OFF = { active: false, count: 0 };

describe('createRecorderBackground', () => {
  it('start cria a sessão e avisa a aba', async () => {
    const { bg, session, deps } = setup();
    expect(await bg.start(7)).toEqual({ active: true, count: 0 });
    await bg.status(7);
    expect(session.data[RECORDER_SESSION_KEY]).toMatchObject({ tabId: 7, fields: [] });
    expect(deps.sendState).toHaveBeenCalledWith(7, { active: true, count: 0 });
  });

  it('start grava a sessão antes de injetar e injeta antes de avisar', async () => {
    const calls: string[] = [];
    const { bg, session } = setup({
      inject: vi.fn(async () => {
        calls.push(`inject:${session.data[RECORDER_SESSION_KEY] ? 'com-sessao' : 'sem-sessao'}`);
      }),
      sendState: vi.fn(async () => {
        calls.push('state');
      }),
    });
    await bg.start(4);
    await bg.status(4);
    expect(calls).toEqual(['inject:com-sessao', 'state']);
  });

  it('start responde antes de a injeção lenta terminar e status() segue funcionando', async () => {
    let release: () => void = () => undefined;
    const { bg, deps } = setup({
      inject: vi.fn(() => new Promise<void>((r) => (release = r))),
    });
    expect(await bg.start(5)).toEqual({ active: true, count: 0 });
    expect(deps.sendState).not.toHaveBeenCalled();
    const status = bg.status(5);
    release();
    expect(await status).toEqual({ active: true, count: 0 });
    expect(deps.inject).toHaveBeenCalledWith(5);
    expect(deps.sendState).toHaveBeenCalledWith(5, { active: true, count: 0 });
  });

  it('start tolera falha na injeção', async () => {
    const { bg, deps } = setup({ inject: vi.fn(() => Promise.reject(new Error('sem permissão'))) });
    expect(await bg.start(4)).toEqual({ active: true, count: 0 });
    await bg.status(4);
    expect(deps.sendState).toHaveBeenCalledWith(4, { active: true, count: 0 });
  });

  it('start tolera falha ao avisar a aba', async () => {
    const { bg } = setup({ sendState: vi.fn(() => Promise.reject(new Error('sem receptor'))) });
    expect(await bg.start(7)).toEqual({ active: true, count: 0 });
  });

  it('start em outra aba descarta a anterior e a avisa', async () => {
    const { bg, deps, session } = setup();
    await bg.start(1);
    await bg.field(1, field('A', '1'));
    await bg.start(2);
    expect(deps.sendState).toHaveBeenCalledWith(1, OFF);
    expect(await bg.status(1)).toEqual(OFF);
    expect(await bg.status(2)).toEqual({ active: true, count: 0 });
    expect(session.data[RECORDER_SESSION_KEY]).toMatchObject({ tabId: 2 });
    expect(deps.openOptions).not.toHaveBeenCalled();
  });

  it('status só é ativo para a aba da sessão', async () => {
    const { bg } = setup();
    expect(await bg.status(1)).toEqual(OFF);
    await bg.start(1);
    expect(await bg.status(1)).toEqual({ active: true, count: 0 });
    expect(await bg.status(2)).toEqual(OFF);
    expect(await bg.status(undefined)).toEqual(OFF);
  });

  it('field faz upsert e ignora remetente de outra aba', async () => {
    const { bg } = setup();
    await bg.start(1);
    expect(await bg.field(1, field('A', '1'))).toEqual({ active: true, count: 1 });
    expect(await bg.field(1, field('A', '2'))).toEqual({ active: true, count: 1 });
    expect(await bg.field(2, field('B', '3'))).toEqual(OFF);
    expect(await bg.field(undefined, field('B', '3'))).toEqual(OFF);
    expect(await bg.field(1, field('A', ''))).toEqual({ active: true, count: 0 });
  });

  it('serializa rajadas de campos sem perder atualizações', async () => {
    const { bg } = setup();
    await bg.start(1);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => bg.field(1, field(`C${i}`, String(i)))),
    );
    expect(results.map((r) => r.count)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await bg.status(1)).toEqual({ active: true, count: 20 });
  });

  it('stop grava o rascunho ANTES de abrir as opções e limpa a sessão', async () => {
    const { bg, local, session, deps, order } = setup();
    await bg.start(1);
    await bg.field(1, field('A', '1'));
    expect(await bg.stop(undefined, 1)).toEqual(OFF);
    expect(order).toEqual(['draft', 'options']);
    const draft = parseRecordingDraft(local.data[RECORDING_DRAFT_KEY]);
    expect(draft?.createdAt).toBe(1000);
    expect(draft?.groups[0]?.fields).toHaveLength(1);
    expect(session.data[RECORDER_SESSION_KEY]).toBeUndefined();
    expect(deps.sendState).toHaveBeenLastCalledWith(1, OFF);
  });

  it('stop sem campos ou com descarte não abre as opções', async () => {
    const a = setup();
    await a.bg.start(1);
    await a.bg.stop(1, undefined);
    expect(a.deps.openOptions).not.toHaveBeenCalled();
    expect(a.local.data[RECORDING_DRAFT_KEY]).toBeUndefined();

    const b = setup();
    await b.bg.start(1);
    await b.bg.field(1, field('A', '1'));
    await b.bg.stop(1, undefined, true);
    expect(b.deps.openOptions).not.toHaveBeenCalled();
    expect(b.local.data[RECORDING_DRAFT_KEY]).toBeUndefined();
    expect(await b.bg.status(1)).toEqual(OFF);
  });

  it('stop de outra aba não encerra a sessão', async () => {
    const { bg } = setup();
    await bg.start(1);
    expect(await bg.stop(2, undefined)).toEqual(OFF);
    expect(await bg.status(1)).toEqual({ active: true, count: 0 });
  });

  it('tabUpdated reinjeta só na aba da sessão e só em "complete"', async () => {
    const { bg, deps } = setup();
    await bg.start(1);
    await bg.status(1);
    vi.mocked(deps.inject).mockClear();
    await bg.tabUpdated(1, 'loading');
    await bg.tabUpdated(2, 'complete');
    expect(deps.inject).not.toHaveBeenCalled();
    await bg.tabUpdated(1, 'complete');
    expect(deps.inject).toHaveBeenCalledWith(1);
  });

  it('tabUpdated engole falha de injeção', async () => {
    const { bg } = setup({ inject: vi.fn(() => Promise.reject(new Error('sem permissão'))) });
    await bg.start(1);
    await expect(bg.tabUpdated(1, 'complete')).resolves.toBeUndefined();
  });

  it('tabRemoved finaliza como parada normal', async () => {
    const { bg, local, deps } = setup();
    await bg.start(1);
    await bg.field(1, field('A', '1'));
    await bg.tabRemoved(2);
    expect(deps.openOptions).not.toHaveBeenCalled();
    await bg.tabRemoved(1);
    expect(deps.openOptions).toHaveBeenCalledTimes(1);
    expect(local.data[RECORDING_DRAFT_KEY]).toBeDefined();
    expect(await bg.status(1)).toEqual(OFF);
  });

  describe('dependência que nunca responde', () => {
    const never = () => new Promise<never>(() => undefined);

    it('inject travado não bloqueia status() seguinte', async () => {
      const { bg } = setup({ inject: vi.fn(never), depTimeoutMs: 20 });
      await expect(bg.start(1)).resolves.toEqual({ active: true, count: 0 });
      await expect(bg.status(1)).resolves.toEqual({ active: true, count: 0 });
    });

    it('sendState travado não bloqueia status() seguinte', async () => {
      const { bg } = setup({ sendState: vi.fn(never), depTimeoutMs: 20 });
      await bg.start(1);
      await expect(bg.status(1)).resolves.toEqual({ active: true, count: 0 });
    });

    it('openOptions travado não bloqueia a fila após parar', async () => {
      const { bg } = setup({ openOptions: vi.fn(never), depTimeoutMs: 20 });
      await bg.start(1);
      await bg.field(1, field('A', '1'));
      await expect(bg.stop(1, undefined)).resolves.toEqual(OFF);
      await expect(bg.status(1)).resolves.toEqual(OFF);
    });
  });
});
