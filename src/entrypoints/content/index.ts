export default defineContentScript({
  matches: ['https://app.clinicaexperts.com.br/*'],
  main() {
    console.debug('[assistente] content script carregado');
  },
});
