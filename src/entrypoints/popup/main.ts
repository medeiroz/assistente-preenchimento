import { createApp } from 'vue';
import App from './App.vue';
import { initI18n, localizeDocument } from '../../shared/i18n';
import { t } from '../../core/i18n';

initI18n();
localizeDocument(t('extName'));
createApp(App).mount('#app');
