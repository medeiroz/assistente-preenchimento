import { describe, expect, it, vi } from 'vitest';
import {
  MENU_CAPTURE,
  MENU_FILL,
  MENU_FILL_NONE,
  MENU_FILL_RULE_PREFIX,
  MENU_PAUSE,
  MENU_RESUME,
  PICKER_START_ATTEMPTS,
  buildMenuItems,
  createMenuController,
  handleMenuClick,
  type ClickDeps,
  type MenuItem,
} from '../../src/shared/context-menu';
import type { FrameEntry } from '../../src/core/frames';
import type { Message, TabStatusAggregate } from '../../src/shared/messages';
import type { Settings } from '../../src/core/model';

const rule = (id: string, name: string) => ({ id, name, mode: 'auto' as const });
function agg(
  frames: { frameId: number; rules: ReturnType<typeof rule>[] }[],
  paused = false,
): TabStatusAggregate {
  return {
    host: 'a.com',
    paused,
    frames: frames.map((f) => ({
      frameId: f.frameId,
      url: 'http://a.com/',
      host: 'a.com',
      paused,
      activeRules: f.rules,
      lastReport: null,
    })),
  };
}
const ids = (items: MenuItem[]) => items.map((i) => i.id);

describe('buildMenuItems', () => {
  it('com regras: captura, submenu com uma entrada por regra e pausar', () => {
    const items = buildMenuItems(
      agg([{ frameId: 0, rules: [rule('r1', 'Cadastro'), rule('r2', '50% off')] }]),
    );
    expect(ids(items)).toEqual([
      MENU_CAPTURE,
      MENU_FILL,
      `${MENU_FILL_RULE_PREFIX}r1`,
      `${MENU_FILL_RULE_PREFIX}r2`,
      MENU_PAUSE,
    ]);
    expect(items[0]?.contexts).toEqual(['editable']);
    expect(items[1]?.title).toBe('Preencher com');
    expect(items[2]).toMatchObject({ title: 'Cadastro', parentId: MENU_FILL });
    expect(items[3]?.title).toBe('50%% off');
    expect(items[4]).toMatchObject({ title: 'Pausar neste site', contexts: ['page', 'frame'] });
  });

  it('regra só em iframe leva o sufixo; presente no topo e no iframe não leva', () => {
    const items = buildMenuItems(
      agg([
        { frameId: 0, rules: [rule('top', 'Topo'), rule('both', 'Ambas')] },
        { frameId: 3, rules: [rule('frm', 'Cartão'), rule('both', 'Ambas')] },
      ]),
    );
    const title = (id: string) => items.find((i) => i.id === MENU_FILL_RULE_PREFIX + id)?.title;
    expect(title('top')).toBe('Topo');
    expect(title('frm')).toBe('Cartão (iframe)');
    expect(title('both')).toBe('Ambas');
  });

  it('sem regras (ou sem registro): item desabilitado', () => {
    for (const tab of [agg([{ frameId: 0, rules: [] }]), agg([]), null]) {
      const items = buildMenuItems(tab);
      expect(items.find((i) => i.id === MENU_FILL_NONE)).toMatchObject({
        title: 'Nenhuma regra nesta página',
        enabled: false,
        parentId: MENU_FILL,
      });
    }
  });

  it('site pausado: "Retomar" e nenhuma regra', () => {
    const items = buildMenuItems(agg([{ frameId: 0, rules: [rule('r1', 'X')] }], true));
    expect(ids(items)).toEqual([MENU_CAPTURE, MENU_FILL, MENU_FILL_NONE, MENU_RESUME]);
    expect(items.at(-1)?.title).toBe('Retomar neste site');
  });
});

describe('createMenuController', () => {
  function setup(tabs: (TabStatusAggregate | null)[]) {
    const calls: string[] = [];
    let i = 0;
    const ctl = createMenuController({
      debounceMs: 100,
      menus: {
        removeAll: () => {
          calls.push('removeAll');
          return Promise.resolve();
        },
        create: (item) => {
          calls.push(`create:${item.id}`);
          return Promise.resolve();
        },
      },
      activeTab: () => {
        const t = tabs[Math.min(i++, tabs.length - 1)];
        return Promise.resolve(t ? { tabId: 7, aggregate: t } : null);
      },
    });
    return { ctl, calls };
  }

  it('init recria tudo (removeAll antes dos creates)', async () => {
    const { ctl, calls } = setup([agg([])]);
    await ctl.init();
    expect(calls[0]).toBe('removeAll');
    expect(calls).toContain(`create:${MENU_CAPTURE}`);
    await ctl.init();
    expect(calls.filter((c) => c === 'removeAll')).toHaveLength(2);
  });

  it('agrupa vários agendamentos (debounce) e não refaz se nada mudou', async () => {
    vi.useFakeTimers();
    try {
      const { ctl, calls } = setup([agg([])]);
      await ctl.init();
      calls.length = 0;
      ctl.schedule();
      ctl.schedule();
      ctl.schedule();
      await vi.advanceTimersByTimeAsync(150);
      expect(calls).toEqual([]); // mesmo menu: nada a recriar

      const second = setup([agg([]), agg([{ frameId: 0, rules: [rule('r', 'R')] }])]);
      await second.ctl.init();
      second.calls.length = 0;
      second.ctl.schedule();
      second.ctl.schedule();
      await vi.advanceTimersByTimeAsync(150);
      expect(second.calls.filter((c) => c === 'removeAll')).toHaveLength(1);
      expect(second.calls).toContain(`create:${MENU_FILL_RULE_PREFIX}r`);
    } finally {
      vi.useRealTimers();
    }
  });
});

const entry = (frameId: number, ...ruleIds: string[]): FrameEntry => ({
  frameId,
  url: 'http://a.com/',
  activeRules: ruleIds.map((id) => rule(id, id)),
  lastReport: null,
});

function deps(over: Partial<ClickDeps> = {}): ClickDeps & {
  sent: { frameId: number; message: Message }[];
} {
  const sent: { frameId: number; message: Message }[] = [];
  return {
    sent,
    sendToFrame: vi.fn((_t: number, frameId: number, message: Message) => {
      sent.push({ frameId, message });
      return Promise.resolve(true);
    }),
    injectFrame: vi.fn(() => Promise.resolve()),
    frames: vi.fn(() => Promise.resolve([entry(0, 'r1'), entry(4, 'r1', 'r2')])),
    loadSettings: vi.fn(() => Promise.resolve({ pausedHosts: ['x.com'] } as Settings)),
    saveSettings: vi.fn(() => Promise.resolve()),
    sleep: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

describe('handleMenuClick', () => {
  it('Capturar este campo: pede a captura do alvo ao frame do clique', async () => {
    const d = deps();
    await handleMenuClick({ menuItemId: MENU_CAPTURE, frameId: 4 }, { id: 9 }, d);
    expect(d.sent).toEqual([{ frameId: 4, message: { type: 'picker/capture-target' } }]);
    expect(d.injectFrame).not.toHaveBeenCalled();
  });

  it('sem content script (sendMessage falha): injeta no frame e liga o picker', async () => {
    let calls = 0;
    const d = deps({
      sendToFrame: vi.fn((_t: number, _f: number, m: Message) => {
        calls++;
        if (m.type === 'picker/capture-target') return Promise.reject(new Error('sem receptor'));
        // o script ainda não ouve na primeira tentativa de picker/start
        return calls === 2 ? Promise.reject(new Error('ainda não')) : Promise.resolve(undefined);
      }),
    });
    await handleMenuClick({ menuItemId: MENU_CAPTURE, frameId: 2 }, { id: 9 }, d);
    expect(d.injectFrame).toHaveBeenCalledWith(9, 2);
    expect(d.sendToFrame).toHaveBeenLastCalledWith(9, 2, { type: 'picker/start' });
    expect(d.sleep).toHaveBeenCalledTimes(1);
  });

  it('frame sem alvo guardado (resposta false): também liga o picker', async () => {
    const d = deps({
      sendToFrame: vi.fn((_t: number, _f: number, m: Message) =>
        Promise.resolve(m.type === 'picker/capture-target' ? false : undefined),
      ),
    });
    await handleMenuClick({ menuItemId: MENU_CAPTURE }, { id: 1 }, d);
    expect(d.injectFrame).toHaveBeenCalledWith(1, 0);
  });

  it('desiste depois de todas as tentativas de picker/start', async () => {
    const d = deps({ sendToFrame: vi.fn(() => Promise.reject(new Error('nada'))) });
    await expect(handleMenuClick({ menuItemId: MENU_CAPTURE }, { id: 1 }, d)).rejects.toThrow();
    expect(d.sleep).toHaveBeenCalledTimes(PICKER_START_ATTEMPTS);
  });

  it('Preencher com: run/now só nos frames onde a regra está ativa', async () => {
    const d = deps();
    await handleMenuClick({ menuItemId: `${MENU_FILL_RULE_PREFIX}r2` }, { id: 5 }, d);
    expect(d.sent).toEqual([
      { frameId: 4, message: { type: 'run/now', payload: { ruleId: 'r2' } } },
    ]);
    d.sent.length = 0;
    await handleMenuClick({ menuItemId: `${MENU_FILL_RULE_PREFIX}r1` }, { id: 5 }, d);
    expect(d.sent.map((s) => s.frameId)).toEqual([0, 4]);
  });

  it('Pausar / Retomar pelo host de topo (pageUrl)', async () => {
    const d = deps();
    await handleMenuClick(
      {
        menuItemId: MENU_PAUSE,
        frameId: 3,
        pageUrl: 'https://app.a.com/x',
        frameUrl: 'https://z.com/',
      },
      { id: 5 },
      d,
    );
    expect(d.saveSettings).toHaveBeenLastCalledWith({ pausedHosts: ['x.com', 'app.a.com'] });
    await handleMenuClick({ menuItemId: MENU_RESUME, pageUrl: 'https://x.com/' }, { id: 5 }, d);
    expect(d.saveSettings).toHaveBeenLastCalledWith({ pausedHosts: [] });
  });

  it('Pausar usa a URL da aba se o pageUrl faltar e ignora host vazio', async () => {
    const d = deps();
    await handleMenuClick({ menuItemId: MENU_PAUSE }, { id: 5, url: 'https://t.com/' }, d);
    expect(d.saveSettings).toHaveBeenLastCalledWith({ pausedHosts: ['x.com', 't.com'] });
    (d.saveSettings as ReturnType<typeof vi.fn>).mockClear();
    await handleMenuClick({ menuItemId: MENU_PAUSE }, { id: 5 }, d);
    expect(d.saveSettings).not.toHaveBeenCalled();
  });

  it('sem aba: não faz nada', async () => {
    const d = deps();
    await handleMenuClick({ menuItemId: MENU_CAPTURE }, undefined, d);
    expect(d.sent).toEqual([]);
  });
});
