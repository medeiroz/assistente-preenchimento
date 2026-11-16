import { triggerFrames, type Rule, type Trigger } from '../model/schema';

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(glob: string): RegExp {
  return new RegExp(`^${glob.split('*').map(escapeRegex).join('.*')}$`);
}

/** Casa o host do padrão (`*`, `*.dominio` ou exato) com o hostname da URL. */
function matchesHost(patternHost: string, host: string): boolean {
  if (patternHost === '*') return true;
  if (patternHost.startsWith('*.')) {
    const base = patternHost.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return patternHost === host;
}

/**
 * Semântica dos match patterns do Chrome: `scheme://host/path`.
 * scheme `*` = http|https; host `*`, `*.dominio` ou exato; path com `*` curinga.
 * Query e hash da URL são ignorados no casamento do path.
 */
export function matchesUrlPattern(pattern: string, url: string): boolean {
  const m = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  const [, scheme = '', patternHost = '', patternPath = ''] = m;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const urlScheme = parsed.protocol.replace(/:$/, '');
  if (scheme === '*' ? urlScheme !== 'http' && urlScheme !== 'https' : scheme !== urlScheme) {
    return false;
  }
  if (!matchesHost(patternHost.toLowerCase(), parsed.hostname.toLowerCase())) return false;
  return globToRegex(patternPath).test(parsed.pathname);
}

/** Algum urlPattern casa E todos os queryParams (se houver) estão presentes com valor igual. */
export function matchesTrigger(trigger: Trigger, url: string): boolean {
  if (!trigger.urlPatterns.some((p) => matchesUrlPattern(p, url))) return false;
  const params = trigger.queryParams;
  if (!params) return true;
  let search: URLSearchParams;
  try {
    search = new URL(url).searchParams;
  } catch {
    return false;
  }
  return Object.entries(params).every(([k, v]) => search.getAll(k).includes(v));
}

/** Regras habilitadas cujo gatilho casa com a URL (não filtra por behavior.mode). */
export function rulesForUrl(rules: Rule[], url: string): Rule[] {
  return rules.filter((r) => r.enabled && matchesTrigger(r.trigger, url));
}

/**
 * Regras do frame: no frame de topo valem todas as que casam com a URL; num frame filho só as
 * com `frames: 'all'`.
 */
export function rulesForFrame(rules: Rule[], url: string, isTop: boolean): Rule[] {
  const matching = rulesForUrl(rules, url);
  return isTop ? matching : matching.filter((r) => triggerFrames(r.trigger) === 'all');
}

/**
 * URL que representa o documento para o casamento. Frames `about:blank`/`srcdoc` herdam a origem
 * do pai, mas `location.origin` vale `null` neles: a origem vem de `window.origin` (ou, na falta,
 * do pai imediato em `ancestorOrigins`). Sem isto nenhum padrão http(s) casaria com eles.
 */
export function frameUrlOf(win: {
  location: { href: string; protocol: string; ancestorOrigins?: ArrayLike<string> };
  origin?: string;
}): string {
  const { href, protocol, ancestorOrigins } = win.location;
  if (protocol !== 'about:') return href;
  const own = win.origin;
  const origin = own && own !== 'null' ? own : ancestorOrigins?.[0];
  return origin && origin !== 'null' ? `${origin}/` : href;
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function containerMatches(
  el: Element,
  container: NonNullable<Trigger['container']>,
): boolean {
  if (!el.matches(container.selector)) return false;
  if (!container.textContains) return true;
  return normalizeSpaces(el.textContent ?? '').includes(normalizeSpaces(container.textContains));
}

/** Há alguma string que case com os dois globs (`*` = qualquer sequência)? */
function globsIntersect(a: string, b: string): boolean {
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    if (i === a.length && j === b.length) return true;
    const key = i * (b.length + 1) + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let r = false;
    if (a[i] === '*') r = go(i + 1, j) || (j < b.length && go(i, j + 1));
    else if (b[j] === '*') r = go(i, j + 1) || (i < a.length && go(i + 1, j));
    else r = i < a.length && j < b.length && a[i] === b[j] && go(i + 1, j + 1);
    memo.set(key, r);
    return r;
  };
  return go(0, 0);
}

function hostsMayOverlap(a: string, b: string): boolean {
  if (a === '*' || b === '*') return true;
  const aw = a.startsWith('*.');
  const bw = b.startsWith('*.');
  if (!aw && !bw) return a === b;
  if (aw && bw) {
    const x = a.slice(2);
    const y = b.slice(2);
    return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
  }
  return aw ? matchesHost(a, b) : matchesHost(b, a);
}

function splitPattern(p: string): { scheme: string; host: string; path: string } | null {
  const m = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(p);
  if (!m) return null;
  return { scheme: m[1] ?? '', host: (m[2] ?? '').toLowerCase(), path: m[3] ?? '' };
}

/**
 * Heurística: dois match patterns podem casar a mesma URL? Compara esquema, host (curingas
 * `*` e `*.dominio`) e path (um glob pode casar o outro). Padrões inválidos nunca se sobrepõem.
 */
export function patternsMayOverlap(a: string, b: string): boolean {
  const pa = splitPattern(a);
  const pb = splitPattern(b);
  if (!pa || !pb) return false;
  if (pa.scheme !== '*' && pb.scheme !== '*' && pa.scheme !== pb.scheme) return false;
  return hostsMayOverlap(pa.host, pb.host) && globsIntersect(pa.path, pb.path);
}

/** Regras habilitadas (exceto a própria) cujos urlPatterns podem se sobrepor aos de `self`. */
export function overlappingRules(self: { id: string; trigger: Trigger }, others: Rule[]): Rule[] {
  return others.filter(
    (r) =>
      r.enabled &&
      r.id !== self.id &&
      self.trigger.urlPatterns.some((p) =>
        r.trigger.urlPatterns.some((q) => patternsMayOverlap(p, q)),
      ),
  );
}
