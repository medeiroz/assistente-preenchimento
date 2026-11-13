# Harness de componentes

Página local com Vue 2.7 + vue-multiselect 2.1 reais (builds UMD de `node_modules`, sem bundler) imitando o modal de NFS-e da CE. Dados fictícios.

- Debug manual: `npm run harness` (imprime a URL).
- Query string: `?preset=loaded` (abre já carregado), `?close=class` (fechar só remove `is-active`).
- API: `window.__harness.{getState, open(preset?), close, hideViaClass}`; `window.__emitted` vira `true` ao clicar em "Emitir NFS-e".
- Imita o site real: com o modal aberto, Escape (keydown ou keyup) no `document` abre o diálogo "Deseja cancelar a emissão da nota?" (`.eui-confirm-wrapper`, botões "Voltar" / "Sim, cancelar"). "Sim, cancelar" fecha o modal e seta `window.__cancelled = true`; "Voltar" só fecha o diálogo. `window.__escapeCount` conta os Escape que chegaram ao document. Os adaptadores nunca podem disparar teclado borbulhante: os testes e2e exigem `__escapeCount === 0`.
- Seção "Outros campos" (`#outros-campos`, dentro do modal, fora dos `.eui-modal-body > .eui-field` diretos): select nativo "Distribuidora", radios "Tipo de conta" (Residencial/Comercial; state guarda o `value` `residencial`/`comercial`), checkbox "Débito automático", toggle de botões "Tipo de pessoa" (Física ativo por padrão, `is-filled`/`is-outlined`), `input[type=date]` "Vencimento" e `input.eui-input-datepicker` "Data de competência" (texto DD/MM/YYYY). Todos com v-model e expostos em `getState()` (`distribuidora`, `tipoConta`, `debitoAuto`, `tipoPessoa`, `vencimento`, `competencia`).
- Servidor: `tests/e2e/harness-server.ts`; testes: `npx playwright test tests/e2e/harness.spec.ts`.
