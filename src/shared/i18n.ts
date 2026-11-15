import { setTranslator } from '../core/i18n';

/** Liga o `t()` ao `browser.i18n` (chamado no início de cada entrypoint). */
export function initI18n(): void {
  setTranslator(
    (key, subs) => browser.i18n.getMessage(key as never, subs),
    browser.i18n.getUILanguage(),
  );
}

/** Páginas da extensão (popup, Configurações): idioma do documento e título já traduzidos. */
export function localizeDocument(title: string): void {
  document.documentElement.lang = browser.i18n.getUILanguage();
  document.title = title;
}
