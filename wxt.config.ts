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
    // Nome e descrição vêm de public/_locales/<idioma>/messages.json (chrome.i18n).
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'pt_BR',
    homepage_url: 'https://github.com/medeiroz/assistente-preenchimento',
    // "tabs" só no build e2e: permite ao teste achar o tabId do harness por URL.
    permissions: [
      'storage',
      'scripting',
      'activeTab',
      'contextMenus',
      ...(mode === 'e2e' ? ['tabs'] : []),
    ],
    ...(mode === 'e2e' ? { host_permissions: E2E_HOSTS } : {}),
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  }),
});
