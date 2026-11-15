import type { t } from './core/i18n';

declare module 'vue' {
  interface ComponentCustomProperties {
    /** Tradução nos templates (registrada em `app.config.globalProperties.$t`). */
    $t: typeof t;
  }
}
