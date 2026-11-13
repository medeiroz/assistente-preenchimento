import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Assistente de Preenchimento',
    description: 'Preenche formulários automaticamente a partir de regras configuráveis.',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: ['https://app.clinicaexperts.com.br/*'],
    optional_host_permissions: ['https://*/*'],
  },
});
