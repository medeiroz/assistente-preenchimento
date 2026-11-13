import { describe, expect, it, vi } from 'vitest';
import { parseRule, type Rule } from '../../src/core/model';
import {
  DYNAMIC_SCRIPT_ID,
  STATIC_MATCHES,
  classifyOrigins,
  computeDynamicMatches,
  isBroadOrigin,
  isStaticallyCovered,
  missingPermissions,
  originsForRule,
  requestForRule,
  syncDynamicScripts,
  type PermissionsApi,
  type ScriptRegistration,
  type ScriptingApi,
} from '../../src/shared/permissions';

function rule(patterns: string[], over: Partial<Rule> = {}): Rule {
  const r = parseRule({
    id: 'r1',
    name: 'Regra',
    trigger: { urlPatterns: patterns },
    fields: [{ id: 'f', locator: { by: 'selector', css: '#a' }, value: 'x' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  if (!r.ok) throw new Error(r.errors.join(';'));
  return { ...r.rule, ...over };
}

interface FakeApi extends PermissionsApi, ScriptingApi {
  calls: string[];
  granted: Set<string>;
  registered: Map<string, ScriptRegistration>;
  grantOnRequest: boolean;
}

function fakeApi(granted: string[] = []): FakeApi {
  const api: FakeApi = {
    calls: [],
    granted: new Set(granted),
    registered: new Map(),
    grantOnRequest: true,
    permissions: {
      contains: vi.fn((p: { origins: string[] }) => {
        api.calls.push(`contains:${p.origins.join(',')}`);
        return Promise.resolve(p.origins.every((o) => api.granted.has(o)));
      }),
      request: vi.fn((p: { origins: string[] }) => {
        api.calls.push(`request:${p.origins.join(',')}`);
        if (api.grantOnRequest) p.origins.forEach((o) => api.granted.add(o));
        return Promise.resolve(api.grantOnRequest);
      }),
    },
    scripting: {
      getRegisteredContentScripts: vi.fn((f: { ids: string[] }) =>
        Promise.resolve(f.ids.flatMap((id) => api.registered.get(id) ?? [])),
      ),
      registerContentScripts: vi.fn((s: ScriptRegistration[]) => {
        api.calls.push('register');
        s.forEach((x) => api.registered.set(x.id, x));
        return Promise.resolve();
      }),
      updateContentScripts: vi.fn((s: ScriptRegistration[]) => {
        api.calls.push('update');
        s.forEach((x) => api.registered.set(x.id, x));
        return Promise.resolve();
      }),
      unregisterContentScripts: vi.fn((f: { ids: string[] }) => {
        api.calls.push('unregister');
        f.ids.forEach((id) => api.registered.delete(id));
        return Promise.resolve();
      }),
    },
  };
  return api;
}

describe('originsForRule', () => {
  it('troca o caminho por /* e remove duplicatas', () => {
    const r = rule(['https://a.com/x/y', 'https://a.com/*', 'https://b.com/z?q=1']);
    expect(originsForRule(r)).toEqual(['https://a.com/*', 'https://b.com/*']);
  });
  it('mantém o curinga de subdomínio', () => {
    expect(originsForRule(rule(['https://*.exemplo.com/app/*']))).toEqual([
      'https://*.exemplo.com/*',
    ]);
  });
  it('remove a porta e normaliza o host para minúsculas', () => {
    expect(originsForRule(rule(['https://Exemplo.COM:8443/*']))).toEqual(['https://exemplo.com/*']);
  });
  it('*:// vira https; http é devolvido mas classificado como não suportado', () => {
    expect(originsForRule(rule(['*://a.com/*', 'http://b.com/*']))).toEqual([
      'https://a.com/*',
      'http://b.com/*',
    ]);
    expect(classifyOrigins(['http://b.com/*', 'https://a.com/*'])).toEqual({
      needed: ['https://a.com/*'],
      unsupported: ['http://b.com/*'],
      broad: [],
    });
  });
  it('detecta hosts amplos demais', () => {
    expect(isBroadOrigin('https://*/*')).toBe(true);
    expect(isBroadOrigin('https://*.*/*')).toBe(true);
    expect(isBroadOrigin('https://*.a.com/*')).toBe(false);
    expect(classifyOrigins(['https://*/x']).broad).toEqual(['https://*/*']);
  });
});

describe('isStaticallyCovered', () => {
  it('cobre a CE em qualquer caminho', () => {
    expect(STATIC_MATCHES).toContain('https://app.clinicaexperts.com.br/*');
    expect(isStaticallyCovered('https://app.clinicaexperts.com.br/nfse/1')).toBe(true);
    expect(isStaticallyCovered('*://app.clinicaexperts.com.br/*')).toBe(true);
  });
  it('não cobre outros sites nem subdomínios', () => {
    expect(isStaticallyCovered('https://outro.com/*')).toBe(false);
    expect(isStaticallyCovered('https://*.clinicaexperts.com.br/*')).toBe(false);
  });
  it('aceita a lista de estáticos injetada (modo e2e)', () => {
    expect(isStaticallyCovered('http://localhost/*', ['http://localhost/*'])).toBe(true);
    expect(classifyOrigins(['http://localhost/*'], ['http://localhost/*']).unsupported).toEqual([]);
  });
});

describe('computeDynamicMatches', () => {
  const all = () => true;
  it('ignora regras desabilitadas', () => {
    expect(computeDynamicMatches([rule(['https://a.com/*'], { enabled: false })], all)).toEqual([]);
  });
  it('ignora origens sem permissão', () => {
    const rules = [rule(['https://a.com/*', 'https://b.com/*'])];
    expect(computeDynamicMatches(rules, (o) => o === 'https://b.com/*')).toEqual([
      'https://b.com/*',
    ]);
  });
  it('ignora os cobertos estaticamente e http (evita injeção dupla)', () => {
    const rules = [rule(['https://app.clinicaexperts.com.br/*', 'http://a.com/*'])];
    expect(computeDynamicMatches(rules, all)).toEqual([]);
  });
  it('deduplica entre regras', () => {
    const rules = [
      rule(['https://a.com/x/*']),
      rule(['https://a.com/y/*', 'https://c.com/*'], { id: 'r2' }),
    ];
    expect(computeDynamicMatches(rules, all)).toEqual(['https://a.com/*', 'https://c.com/*']);
  });
});

describe('missingPermissions', () => {
  it('lista só o que falta, de regras habilitadas', async () => {
    const api = fakeApi(['https://a.com/*']);
    const rules = [
      rule(['https://a.com/*', 'https://b.com/*']),
      rule(['https://off.com/*'], { id: 'r2', enabled: false }),
      rule(['https://app.clinicaexperts.com.br/*'], { id: 'r3' }),
    ];
    expect(await missingPermissions(rules, api)).toEqual(['https://b.com/*']);
  });
});

describe('requestForRule', () => {
  it('pede só origens específicas, https e não estáticas', async () => {
    const api = fakeApi();
    const r = rule([
      'https://a.com/x',
      'https://app.clinicaexperts.com.br/*',
      'http://h.com/*',
      'https://*/*',
    ]);
    const res = await requestForRule(r, api);
    expect(api.permissions.request).toHaveBeenCalledWith({ origins: ['https://a.com/*'] });
    expect(res).toEqual({ granted: true, unsupported: ['http://h.com/*'] });
  });
  it('omite origens já concedidas e não chama a API se nada falta', async () => {
    const api = fakeApi();
    const r = rule(['https://a.com/*', 'https://b.com/*']);
    await requestForRule(r, api, new Set(['https://a.com/*']));
    expect(api.permissions.request).toHaveBeenCalledWith({ origins: ['https://b.com/*'] });
    const none = await requestForRule(rule(['https://app.clinicaexperts.com.br/*']), api);
    expect(none.granted).toBe(true);
    expect(api.permissions.request).toHaveBeenCalledTimes(1);
  });
  it('chama request de forma síncrona, antes de qualquer outra chamada assíncrona', () => {
    const api = fakeApi();
    void requestForRule(rule(['https://a.com/*']), api);
    // Sem await entre a chamada e o request: já foi a primeira (e única) chamada.
    expect(api.calls).toEqual(['request:https://a.com/*']);
  });
  it('negado resulta em granted=false; erro da API também (sem lançar)', async () => {
    const api = fakeApi();
    api.grantOnRequest = false;
    expect((await requestForRule(rule(['https://a.com/*']), api)).granted).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    api.permissions.request = () => Promise.reject(new Error('x'));
    expect((await requestForRule(rule(['https://a.com/*']), api)).granted).toBe(false);
  });
});

describe('syncDynamicScripts', () => {
  const file = 'content-scripts/content.js';
  const run = (api: FakeApi, rules: Rule[]) =>
    syncDynamicScripts({ api, loadRules: () => Promise.resolve(rules), scriptFile: file });

  it('registra quando há regra com permissão', async () => {
    const api = fakeApi(['https://a.com/*']);
    expect(await run(api, [rule(['https://a.com/p/*'])])).toBe('registered');
    expect(api.registered.get(DYNAMIC_SCRIPT_ID)).toEqual({
      id: DYNAMIC_SCRIPT_ID,
      matches: ['https://a.com/*'],
      js: [file],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    });
  });
  it('não registra sem permissão, nem para regras estáticas ou desabilitadas', async () => {
    const api = fakeApi();
    const rules = [
      rule(['https://a.com/*']),
      rule(['https://app.clinicaexperts.com.br/*'], { id: 'r2' }),
      rule(['https://b.com/*'], { id: 'r3', enabled: false }),
    ];
    expect(await run(api, rules)).toBe('unchanged');
    expect(api.calls).not.toContain('register');
  });
  it('atualiza quando os matches mudam e fica quieto quando não mudam', async () => {
    const api = fakeApi(['https://a.com/*', 'https://b.com/*']);
    await run(api, [rule(['https://a.com/*'])]);
    expect(await run(api, [rule(['https://a.com/*'])])).toBe('unchanged');
    expect(await run(api, [rule(['https://a.com/*', 'https://b.com/*'])])).toBe('updated');
    expect(api.registered.get(DYNAMIC_SCRIPT_ID)?.matches).toEqual([
      'https://a.com/*',
      'https://b.com/*',
    ]);
  });
  it('lista vazia remove o registro', async () => {
    const api = fakeApi(['https://a.com/*']);
    await run(api, [rule(['https://a.com/*'])]);
    expect(await run(api, [])).toBe('unregistered');
    expect(api.registered.size).toBe(0);
  });
  it('remove quando a permissão é revogada', async () => {
    const api = fakeApi(['https://a.com/*']);
    const rules = [rule(['https://a.com/*'])];
    await run(api, rules);
    api.granted.clear();
    expect(await run(api, rules)).toBe('unregistered');
  });
  it('erros viram warn e nunca lançam', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = fakeApi(['https://a.com/*']);
    api.scripting.registerContentScripts = () => Promise.reject(new Error('boom'));
    expect(await run(api, [rule(['https://a.com/*'])])).toBe('error');
    expect(warn).toHaveBeenCalled();
    const failing = await syncDynamicScripts({
      api,
      loadRules: () => Promise.reject(new Error('x')),
      scriptFile: file,
    });
    expect(failing).toBe('error');
  });
});
