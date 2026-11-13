# Harness de componentes

Página local com Vue 2.7 + vue-multiselect 2.1 reais (builds UMD de `node_modules`, sem bundler) imitando o modal de NFS-e da CE. Dados fictícios.

- Debug manual: `npm run harness` (imprime a URL).
- Query string: `?preset=loaded` (abre já carregado), `?close=class` (fechar só remove `is-active`).
- API: `window.__harness.{getState, open(preset?), close, hideViaClass}`; `window.__emitted` vira `true` ao clicar em "Emitir NFS-e".
- Imita o site real: com o modal aberto, Escape (keydown ou keyup) no `document` abre o diálogo "Deseja cancelar a emissão da nota?" (`.eui-confirm-wrapper`, botões "Voltar" / "Sim, cancelar"). "Sim, cancelar" fecha o modal e seta `window.__cancelled = true`; "Voltar" só fecha o diálogo. `window.__escapeCount` conta os Escape que chegaram ao document. Os adaptadores nunca podem disparar teclado borbulhante: os testes e2e exigem `__escapeCount === 0`.
- Servidor: `tests/e2e/harness-server.ts`; testes: `npx playwright test tests/e2e/harness.spec.ts`.
