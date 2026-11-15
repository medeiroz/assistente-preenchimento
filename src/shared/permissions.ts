import { triggerFrames, type Rule } from '../core/model';

/**
 * Permissões sob demanda (WP4.3).
 *
 * Em produção o manifest não cobre site nenhum: todo site depende de `optional_host_permissions`
 * (https e http) concedida pelo usuário, e o content script é registrado dinamicamente. Só o build de
 * testes (`--mode e2e`) cobre estaticamente o site de exemplo e localhost/127.0.0.1.
 * Permissões são por origem: o caminho do padrão sempre vira `/*`.
 */

export const DYNAMIC_SCRIPT_ID = 'assistente-dinamico';

const E2E_STATIC = [
  'https://app.clinicaexperts.com.br/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
];

/**
 * O que o manifest já cobre (host_permissions + matches do content script). A comparação com o
 * modo fica inline para o bundler descartar a lista de testes do build de produção.
 */
export const STATIC_MATCHES: readonly string[] = import.meta.env.MODE === 'e2e' ? E2E_STATIC : [];

const PATTERN = /^(https?|\*):\/\/([^/]+)\/.*$/;

/** Converte um match pattern em padrão de permissão (`scheme://host/*`); null se inválido. `*://` vira https. */
export function toOriginPattern(pattern: string): string | null {
  return toOriginPatterns(pattern)[0] ?? null;
}

/** Como `toOriginPattern`, mas `*://` gera as duas origens (https e http). Vazio se inválido. */
export function toOriginPatterns(pattern: string): string[] {
  const m = PATTERN.exec(pattern);
  if (!m) return [];
  const [, scheme = '', rawHost = ''] = m;
  const host = rawHost.replace(/:\d+$/, '').toLowerCase();
  if (host === '') return [];
  return (scheme === '*' ? ['https', 'http'] : [scheme]).map((s) => `${s}://${host}/*`);
}

/** Origens (padrões de permissão) dos urlPatterns da regra, http e https. */
export function originsForRule(rule: Pick<Rule, 'trigger'>): string[] {
  const out: string[] = [];
  for (const p of rule.trigger.urlPatterns) {
    for (const o of toOriginPatterns(p)) if (!out.includes(o)) out.push(o);
  }
  return out;
}

export function isStaticallyCovered(
  pattern: string,
  statics: readonly string[] = STATIC_MATCHES,
): boolean {
  const origins = toOriginPatterns(pattern);
  const covered = new Set(statics.flatMap(toOriginPatterns));
  return origins.length > 0 && origins.every((o) => covered.has(o));
}

/** optional_host_permissions cobre https e http. */
export function isSupportedOrigin(origin: string): boolean {
  return origin.startsWith('https://') || origin.startsWith('http://');
}

/** Origem http que sai da máquina (fora de localhost/127.0.0.1/[::1]): tráfego sem criptografia. */
export function isInsecureOrigin(origin: string): boolean {
  if (!origin.startsWith('http://')) return false;
  const host = hostOfOrigin(origin).replace(/:\d+$/, '');
  return !['localhost', '127.0.0.1', '[::1]'].includes(host) && !host.endsWith('.localhost');
}

/** Host `*`, `*.*` ou similar: amplo demais para pedir permissão. */
export function isBroadOrigin(origin: string): boolean {
  const m = PATTERN.exec(origin);
  return m !== null && /^\*(\.\*)*$/.test(m[2] ?? '');
}

export interface OriginClassification {
  /** https/http específicos e não cobertos pelo manifest: dependem de permissão concedida. */
  needed: string[];
  /** Origens http (exceto loopback) específicas: pedem permissão como as demais, só avisam. */
  insecure: string[];
  /** Legado: origens de esquema não suportado. Hoje fica sempre vazio (http é suportado). */
  unsupported: string[];
  /** Host curinga total: não se pede permissão ampla. */
  broad: string[];
}

export function classifyOrigins(
  patterns: readonly string[],
  statics: readonly string[] = STATIC_MATCHES,
): OriginClassification {
  const res: OriginClassification = { needed: [], insecure: [], unsupported: [], broad: [] };
  const push = (bucket: string[], o: string): void => {
    if (!bucket.includes(o)) bucket.push(o);
  };
  for (const p of patterns) {
    for (const o of toOriginPatterns(p)) {
      if (isBroadOrigin(o)) {
        push(res.broad, o);
        continue;
      }
      if (isInsecureOrigin(o)) push(res.insecure, o);
      if (isStaticallyCovered(o, statics)) continue;
      push(isSupportedOrigin(o) ? res.needed : res.unsupported, o);
    }
  }
  return res;
}

export function classifyRule(
  rule: Pick<Rule, 'trigger'>,
  statics: readonly string[] = STATIC_MATCHES,
): OriginClassification {
  return classifyOrigins(rule.trigger.urlPatterns, statics);
}

/** Host legível de um padrão de origem (`https://a.com/*` vira `a.com`). */
export function hostOfOrigin(origin: string): string {
  return /^[a-z*]+:\/\/([^/]+)/.exec(origin)?.[1] ?? origin;
}

// ------------------------------------------------------------------ API do Chrome (injetável)

export interface PermissionsApi {
  permissions: {
    contains(p: { origins: string[] }): Promise<boolean>;
    request(p: { origins: string[] }): Promise<boolean>;
  };
}

export interface ScriptRegistration {
  id: string;
  matches: string[];
  js: string[];
  runAt: 'document_idle';
  allFrames: boolean;
  /** Frames `about:blank`/`srcdoc` herdam a origem do pai. Só junto com `allFrames`. */
  matchOriginAsFallback?: boolean;
  persistAcrossSessions: boolean;
}

export interface ScriptingApi {
  scripting: {
    getRegisteredContentScripts(filter: {
      ids: string[];
    }): Promise<
      { id: string; matches?: string[]; allFrames?: boolean; matchOriginAsFallback?: boolean }[]
    >;
    registerContentScripts(scripts: ScriptRegistration[]): Promise<void>;
    updateContentScripts(scripts: ScriptRegistration[]): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  };
}

/** Origens de regras habilitadas que dependem de permissão e ainda não foram concedidas. */
export async function missingPermissions(
  rules: readonly Rule[],
  api: PermissionsApi,
): Promise<string[]> {
  const needed = new Set<string>();
  for (const r of rules) {
    if (!r.enabled) continue;
    for (const o of classifyRule(r).needed) needed.add(o);
  }
  const missing: string[] = [];
  for (const o of needed) {
    if (!(await api.permissions.contains({ origins: [o] }))) missing.push(o);
  }
  return missing;
}

/**
 * Pede a permissão das origens da regra. Tem de ser chamada dentro de um gesto do usuário:
 * nada assíncrono acontece antes de `permissions.request`. Origens já conhecidas como
 * concedidas (`granted`, opcional e síncrono) são omitidas; o Chrome também não pergunta
 * de novo por origens já concedidas.
 */
export function requestForRule(
  rule: Pick<Rule, 'trigger'>,
  api: PermissionsApi,
  granted: ReadonlySet<string> = new Set(),
): Promise<{ granted: boolean; unsupported: string[] }> {
  const { needed, unsupported } = classifyRule(rule);
  const origins = needed.filter((o) => !granted.has(o));
  if (origins.length === 0) return Promise.resolve({ granted: true, unsupported });
  return api.permissions
    .request({ origins })
    .then((ok) => ({ granted: ok, unsupported }))
    .catch((e: unknown) => {
      console.warn('[assistente] pedido de permissão falhou', e);
      return { granted: false, unsupported };
    });
}

/** Padrões a registrar dinamicamente: regras habilitadas, com permissão e não cobertas pelo manifest. */
export function computeDynamicMatches(
  rules: readonly Rule[],
  grantedCheck: (origin: string) => boolean,
): string[] {
  const out = new Set<string>();
  for (const r of rules) {
    if (!r.enabled) continue;
    for (const o of classifyRule(r).needed) if (grantedCheck(o)) out.add(o);
  }
  return [...out].sort();
}

/**
 * Algum padrão registrado vale para iframes? Sim quando uma regra habilitada com `frames: 'all'`
 * tem ao menos uma origem registrada (permissão concedida).
 */
export function needsAllFrames(
  rules: readonly Rule[],
  grantedCheck: (origin: string) => boolean,
): boolean {
  return rules.some(
    (r) =>
      r.enabled &&
      triggerFrames(r.trigger) === 'all' &&
      classifyRule(r).needed.some((o) => grantedCheck(o)),
  );
}

export interface DynamicSyncDeps {
  api: PermissionsApi & ScriptingApi;
  loadRules(): Promise<Rule[]>;
  /** Caminho do content script gerado pelo WXT (ex.: `content-scripts/content.js`). */
  scriptFile: string;
}

export type DynamicSyncResult = 'registered' | 'updated' | 'unregistered' | 'unchanged' | 'error';

/** Registra, atualiza ou remove o content script dinâmico conforme regras e permissões. Nunca lança. */
export async function syncDynamicScripts(deps: DynamicSyncDeps): Promise<DynamicSyncResult> {
  try {
    const { api } = deps;
    const rules = await deps.loadRules();
    const candidates = new Set<string>();
    for (const r of rules) {
      if (r.enabled) for (const o of classifyRule(r).needed) candidates.add(o);
    }
    const granted = new Set<string>();
    for (const o of candidates) {
      if (await api.permissions.contains({ origins: [o] })) granted.add(o);
    }
    const matches = computeDynamicMatches(rules, (o) => granted.has(o));
    const allFrames = needsAllFrames(rules, (o) => granted.has(o));
    const [existing] = await api.scripting.getRegisteredContentScripts({
      ids: [DYNAMIC_SCRIPT_ID],
    });

    if (matches.length === 0) {
      if (!existing) return 'unchanged';
      await api.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
      return 'unregistered';
    }
    const script: ScriptRegistration = {
      id: DYNAMIC_SCRIPT_ID,
      matches,
      js: [deps.scriptFile],
      runAt: 'document_idle',
      allFrames,
      ...(allFrames ? { matchOriginAsFallback: true } : {}),
      persistAcrossSessions: true,
    };
    if (!existing) {
      await api.scripting.registerContentScripts([script]);
      return 'registered';
    }
    const current = [...(existing.matches ?? [])].sort();
    const sameFrames =
      (existing.allFrames ?? false) === allFrames &&
      (existing.matchOriginAsFallback ?? false) === allFrames;
    if (
      sameFrames &&
      current.length === matches.length &&
      current.every((m, i) => m === matches[i])
    ) {
      return 'unchanged';
    }
    await api.scripting.updateContentScripts([script]);
    return 'updated';
  } catch (e) {
    console.warn('[assistente] falha ao sincronizar content script dinâmico', e);
    return 'error';
  }
}
