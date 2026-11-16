import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { initI18n, localizeDocument } from '../../shared/i18n';
import { t } from '../../core/i18n';

initI18n();
localizeDocument(t('optionsTitle'));
const app = createApp(App);
app.config.globalProperties.$t = t;
app.mount('#app');
