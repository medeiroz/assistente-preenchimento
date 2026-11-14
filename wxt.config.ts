import { defineConfig } from 'wxt';

// Build de testes (`wxt build --mode e2e`): libera o site de exemplo e o localhost para o harness.
// Gera em .output/chrome-mv3-e2e (sufixo de modo padrão do WXT).
// O build de produção é genérico: nenhum host fixo; o acesso é pedido por site (optional_host_permissions).
const E2E_HOSTS = [
  'https://app.clinicaexperts.com.br/*',
  'http://localhost/*',
  'http://127.0.0.1/*',
];

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ mode }) => ({
    name: 'Assistente de Preenchimento',
    description:
      'Preenche campos de formulários automaticamente nos sites que você escolher, com regras que você mesmo cria.',
    homepage_url: 'https://github.com/medeiroz/assistente-preenchimento',
    // "tabs" só no build e2e: permite ao teste achar o tabId do harness por URL.
    permissions: ['storage', 'scripting', 'activeTab', ...(mode === 'e2e' ? ['tabs'] : [])],
    ...(mode === 'e2e' ? { host_permissions: E2E_HOSTS } : {}),
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    optional_host_permissions: ['https://*/*'],
  }),
});
