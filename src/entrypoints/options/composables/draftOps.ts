import type { Rule } from '../../../core/model';
import { generateRuleId } from './draftIds';
import type { BuildOptions } from './draftTypes';
import { t, uiLocale } from '../../../core/i18n';

// ---------------------------------------------------------------- operações

/** Move o item de `from` para a posição final `to` (arrastar e soltar). Não muta a entrada. */
export function reorderFields<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

/**
 * Índice final ao soltar o item `from` sobre o card `over`, antes ou depois dele
 * (a linha de inserção fica entre dois cards).
 */
export function dropTarget(from: number, over: number, where: 'before' | 'after'): number {
  const insertAt = over + (where === 'after' ? 1 : 0);
  return insertAt > from ? insertAt - 1 : insertAt;
}

export function moveField<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const out = [...items];
  if (index < 0 || index >= out.length || target < 0 || target >= out.length) return out;
  const a = out[index] as T;
  const b = out[target] as T;
  out[index] = b;
  out[target] = a;
  return out;
}

function copyName(name: string, existingNames: Set<string>): string {
  let candidate = t('copySuffix', name);
  let n = 2;
  while (existingNames.has(candidate)) candidate = t('copySuffixN', name, n++);
  return candidate;
}

/** Cópia da regra com id novo e nome "… (cópia)". */
export function duplicateRule(
  rule: Rule,
  existing: readonly Rule[],
  opts: BuildOptions = {},
): Rule {
  const copy = JSON.parse(JSON.stringify(rule)) as Rule;
  copy.name = copyName(rule.name, new Set(existing.map((r) => r.name)));
  copy.id = generateRuleId(
    rule.name,
    existing.map((r) => r.id),
    opts.rng,
  );
  copy.updatedAt = (opts.now ?? new Date()).toISOString();
  return copy;
}

// ---------------------------------------------------------------- agrupamento por site

export const anySite = (): string => t('siteAny');
export const noSite = (): string => t('siteNone');

/** Host do padrão de URL (ex.: `https://app.site.com/*` → `app.site.com`); `*` → `*`. */
export function hostOfPattern(pattern: string | undefined): string | null {
  if (!pattern) return null;
  const m = /^(?:https?|\*):\/\/([^/]+)/.exec(pattern.trim());
  const host = m?.[1];
  return host ? host : null;
}

export function siteLabel(pattern: string | undefined): string {
  const host = hostOfPattern(pattern);
  if (host === null) return noSite();
  return host === '*' ? anySite() : host;
}

export interface RuleGroup {
  site: string;
  rules: Rule[];
}

export function groupRulesBySite(rules: readonly Rule[]): RuleGroup[] {
  const map = new Map<string, Rule[]>();
  for (const r of rules) {
    const site = siteLabel(r.trigger.urlPatterns[0]);
    const list = map.get(site) ?? [];
    list.push(r);
    map.set(site, list);
  }
  const rank = (s: string): number => (s === anySite() ? 1 : s === noSite() ? 2 : 0);
  return [...map.entries()]
    .map(([site, list]) => ({
      site,
      rules: [...list].sort((a, b) => a.name.localeCompare(b.name, uiLocale())),
    }))
    .sort((a, b) => rank(a.site) - rank(b.site) || a.site.localeCompare(b.site, uiLocale()));
}

export function fieldCountLabel(n: number): string {
  return n === 1 ? t('fieldCountOne') : t('fieldCountMany', n);
}
