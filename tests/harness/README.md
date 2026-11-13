# Harness de componentes

Página local com Vue 2.7 + vue-multiselect 2.1 reais (builds UMD de `node_modules`, sem bundler) imitando o modal de NFS-e da CE. Dados fictícios.

- Debug manual: `npm run harness` (imprime a URL).
- Query string: `?preset=loaded` (abre já carregado), `?close=class` (fechar só remove `is-active`).
- API: `window.__harness.{getState, open(preset?), close, hideViaClass}`; `window.__emitted` vira `true` ao clicar em "Emitir NFS-e".
- Servidor: `tests/e2e/harness-server.ts`; testes: `npx playwright test tests/e2e/harness.spec.ts`.
