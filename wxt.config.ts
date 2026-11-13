import { defineConfig } from 'wxt';

// Build de testes (`wxt build --mode e2e`): libera localhost para o harness.
// Gera em .output/chrome-mv3-e2e (sufixo de modo padrão do WXT).
const E2E_HOSTS = ['http://localhost/*', 'http://127.0.0.1/*'];

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ mode }) => ({
    name: 'Assistente de Preenchimento',
    description: 'Preenche formulários automaticamente a partir de regras configuráveis.',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: ['https://app.clinicaexperts.com.br/*', ...(mode === 'e2e' ? E2E_HOSTS : [])],
    optional_host_permissions: ['https://*/*'],
  }),
});
