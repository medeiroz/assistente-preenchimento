import ptBR from '../../public/_locales/pt_BR/messages.json';

/**
 * Tradução sem depender do Chrome. O padrão é o catálogo pt_BR (importado como JSON, no mesmo
 * formato do `chrome.i18n`). Os entrypoints injetam `browser.i18n.getMessage` com `setTranslator`;
 * quando ele devolve '' (chave ausente no idioma), cai no padrão. A tradução acontece no momento
 * da chamada de `t()`, nunca no carregamento do módulo.
 */

export interface CatalogEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}
export type Catalog = Record<string, CatalogEntry>;

export type Translator = (key: string, substitutions?: string[]) => string;

const DEFAULT_LOCALE = 'pt-BR';

let translator: Translator | undefined;
let locale = DEFAULT_LOCALE;

/** Aplica placeholders nomeados (`$nome$`) e posicionais (`$1`..`$9`), como o `chrome.i18n`. */
export function formatMessage(entry: CatalogEntry, subs: readonly (string | number)[]): string {
  const values = subs.map(String);
  let text = entry.message;
  const named = entry.placeholders;
  if (named) {
    const byName = new Map(Object.entries(named).map(([k, v]) => [k.toLowerCase(), v.content]));
    text = text.replace(
      /\$([A-Za-z0-9_@]+)\$/g,
      (m, name: string) => byName.get(name.toLowerCase()) ?? m,
    );
  }
  return text.replace(/\$(\$|[1-9])/g, (_m, d: string) =>
    d === '$' ? '$' : (values[Number(d) - 1] ?? ''),
  );
}

/** Tradução pelo catálogo padrão (pt_BR). Chave desconhecida devolve a própria chave. */
export function defaultMessage(key: string, ...subs: (string | number)[]): string {
  const entry = (ptBR as Catalog)[key];
  return entry ? formatMessage(entry, subs) : key;
}

export function t(key: string, ...subs: (string | number)[]): string {
  if (translator) {
    const out = translator(key, subs.map(String));
    if (out) return out;
  }
  return defaultMessage(key, ...subs);
}

/** Injeta o tradutor (ex.: `browser.i18n.getMessage`) e o idioma da interface; `null` restaura o padrão. */
export function setTranslator(fn: Translator | null, uiLanguage?: string): void {
  translator = fn ?? undefined;
  locale = uiLanguage || DEFAULT_LOCALE;
}

/** Idioma da interface, para formatar números e datas (padrão: pt-BR). */
export function uiLocale(): string {
  return locale;
}
