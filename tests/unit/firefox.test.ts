import { describe, expect, it, vi } from 'vitest';
import config from '../../wxt.config';
import { watchSyncTriggers, type SyncTriggersApi } from '../../src/shared/permissions';
import { topHostOf, topOriginOf } from '../../src/core/frames/top-host';
import { frameUrlOf } from '../../src/core/engine/matcher';

type Manifest = Record<string, unknown>;
type ManifestFn = (env: { mode: string; browser: string }) => Manifest;
const manifestOf = (browser: string, mode = 'production'): Manifest =>
  (config.manifest as ManifestFn)({ mode, browser });

describe('manifest por navegador', () => {
  it('Chrome não ganha nenhuma chave específica do Firefox', () => {
    const m = manifestOf('chrome');
    expect(m).not.toHaveProperty('browser_specific_settings');
    expect(Object.keys(m).sort()).toEqual(
      [
        'action',
        'default_locale',
        'description',
        'homepage_url',
        'name',
        'optional_host_permissions',
        'permissions',
      ].sort(),
    );
    expect(m.permissions).toEqual(['storage', 'scripting', 'activeTab', 'contextMenus']);
  });

  it('Firefox = Chrome + browser_specific_settings', () => {
    const { browser_specific_settings: bss, ...rest } = manifestOf('firefox');
    expect(rest).toEqual(manifestOf('chrome'));
    expect(bss).toMatchObject({
      gecko: {
        id: 'assistente-preenchimento@medeiroz.github.io',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    });
  });

  it('build e2e do Chrome segue sem browser_specific_settings', () => {
    expect(manifestOf('chrome', 'e2e')).not.toHaveProperty('browser_specific_settings');
  });
});

function fakeTriggers() {
  const l: Record<string, ((...a: never[]) => void)[]> = {};
  const ev = (name: string) => ({
    addListener: (cb: (...a: never[]) => void) => (l[name] ??= []).push(cb),
  });
  const api = {
    runtime: { onStartup: ev('startup'), onInstalled: ev('installed') },
    permissions: { onAdded: ev('added'), onRemoved: ev('removed') },
  } as unknown as SyncTriggersApi;
  const fire = (name: string, ...args: unknown[]) =>
    l[name]?.forEach((cb) => (cb as (...a: unknown[]) => void)(...args));
  return { api, fire };
}

describe('watchSyncTriggers', () => {
  it('re-sincroniza em onStartup, onAdded, onRemoved e onInstalled(update)', () => {
    const { api, fire } = fakeTriggers();
    const schedule = vi.fn();
    watchSyncTriggers(api, schedule);
    fire('startup');
    fire('added');
    fire('removed');
    fire('installed', { reason: 'update' });
    expect(schedule).toHaveBeenCalledTimes(4);
  });
  it('onInstalled(install) fica por conta da semeadura', () => {
    const { api, fire } = fakeTriggers();
    const schedule = vi.fn();
    watchSyncTriggers(api, schedule);
    fire('installed', { reason: 'install' });
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('sem location.ancestorOrigins (Firefox < 148)', () => {
  const loc = { hostname: 'frame.com' };
  it('usa a URL de topo do background', () => {
    expect(topHostOf(loc, false, 'https://topo.com/x')).toBe('topo.com');
  });
  it('topOriginOf não inventa origem', () => {
    expect(topOriginOf({})).toBeUndefined();
  });
  it('frame about:blank usa window.origin', () => {
    expect(
      frameUrlOf({
        location: { href: 'about:blank', protocol: 'about:' },
        origin: 'https://a.com',
      }),
    ).toBe('https://a.com/');
  });
});
