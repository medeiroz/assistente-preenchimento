import type { Rule, Trigger } from '../model/schema';

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
