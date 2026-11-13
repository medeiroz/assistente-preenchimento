# Plano de Execução

> Complementa [arquitetura.md](arquitetura.md). Data: 2026-11-13. Status: aguardando aprovação.

## 1. Modelo de trabalho

| Papel | Quem | Faz | Não faz |
|---|---|---|---|
| **Arquiteto / Orquestrador** | Agente principal | Divide o trabalho, escreve os briefs, define contratos, revisa diffs contra a especificação, decide, valida no site real, conversa com você | Não escreve código de produção |
| **Implementador** | Agente **implementador** | Escreve código e testes de um pacote de trabalho (WP), roda os testes localmente | Não muda contratos nem arquivos fora do seu escopo |
| **Verificador** | Agente **verificador** | Roda `typecheck`, `lint`, `test`, `build` e E2E. Relata falhas com saída literal. Confere critérios de aceite objetivos (checklist) | Não corrige código |
| **Você** | — | Aprova fases, decide pendências, testa no dia a dia | — |

### Ciclo de cada WP

```
 Orquestrador escreve o brief
        │
        ▼
 Implementador ── código + testes ──┐
        ▲                                     ▼
        │                         Verificador
        │                         typecheck · lint · test · build
        │                                     │
        │   falhou (máx. 2 voltas)            ▼
        └──────────────────────── Orquestrador revisa o diff
                                  contra brief + arquitetura
                                              │
                                   aprovado   ▼
                                  commit local do WP
                                  (mensagem sem atribuição a IA)
```

- Depois de **2 voltas sem passar**, o orquestrador intervém: reescreve o brief, divide o WP ou ajusta o contrato. Não insiste no mesmo caminho.
- **Contratos primeiro.** Interfaces e tipos (`core/model`, `FieldAdapter`, `ConfigRepository`, mensagens) são definidos num WP próprio e revisados antes dos WPs que dependem deles. Assim os implementadores trabalham em paralelo sem conflito.
- **Paralelismo:** WPs da mesma onda rodam ao mesmo tempo, cada um num **git worktree isolado** e com arquivos disjuntos. O orquestrador faz o merge na ordem da onda.
- **Validação no site real** (CE) é feita só pelo orquestrador, no seu Chrome, e **nunca** clica em "Emitir".

### Template de brief (todo WP recebe um)

```
CONTEXTO     o que é o projeto, link para docs/arquitetura.md (§ relevantes)
OBJETIVO     uma frase
ESCOPO       arquivos que PODE criar/alterar (lista fechada)
CONTRATO     interfaces que deve implementar/consumir (colado no brief)
ACEITE       critérios verificáveis (testes que devem existir e passar)
COMANDOS     pnpm typecheck && pnpm lint && pnpm test [&& pnpm e2e]
PROIBIDO     mudar contratos, adicionar dependências não listadas,
             tocar arquivos fora do escopo, usar dados reais de clientes
ENTREGA      resumo do que fez + saída dos comandos + dúvidas
```

## 2. Visão das ondas

```
Onda A  ─ WP0.1 Scaffold
             │
Onda B  ─ WP0.2 Fixture CE ─┬─ WP0.3 Contratos ─┬─ WP0.4 Harness Vue2 ─┬─ WP3.1 Expressões (puro)
             │              │                   │                      │
Onda C  ─ WP1.1 Locator ── WP1.2 Adapters ── WP1.3 Watcher ── WP1.4 Runner
             │
Onda D  ─ WP1.5 Integração content script + toast
          WP1.6 E2E + validação real na CE          ◄── MARCO 1: NFS-e preenche sozinha
             │
Onda E  ─ WP2.1 Storage + mensagens
             │
Onda F  ─ WP2.3 Options ── WP2.4 Popup ── WP2.5 Modo botão + desfazer
                                                    ◄── MARCO 2: editável e sincronizado
Onda G  ─ WP3.2 Variáveis + preview ── WP4.1 Adapters extras ── WP4.3 Permissões dinâmicas
             │                                                     ◄── MARCO 3: dinâmico
Onda H  ─ WP4.2 Capturar campo
          WP4.4 Regras energia/água (com você)     ◄── MARCO 4: genérica
             │
(Opcional) WP5.x Repositório remoto no servidor próprio
```

## 3. Pacotes de trabalho

Legenda: **Impl** = modelo do implementador · **Dep** = dependências.

### Fase 0 — Fundação

#### WP0.1 — Scaffold do projeto
- **Impl:** Implementador · **Dep:** — · **Onda:** A
- `git init`, WXT + TypeScript (strict) + Vue 3, pnpm, ESLint + Prettier, Vitest + happy-dom, Playwright configurado para carregar a extensão.
- Estrutura de pastas da arquitetura §14 com arquivos vazios ou *stubs*.
- Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `e2e`.
- **Aceite:** `pnpm build` gera a extensão. A extensão carrega no Chrome sem erros. Os quatro comandos de verificação passam com um teste de exemplo.

#### WP0.2 — Fixture do modal NFS-e
- **Impl:** Orquestrador (captura) + Verificador (limpeza e verificação) · **Dep:** WP0.1 · **Onda:** B
- O orquestrador abre o modal na CE e extrai o HTML do modal **substituindo no próprio navegador** todos os textos e valores pessoais (nome, CPF, telefone, e-mail, endereço) por dados fictícios antes de exportar.
- O verificador confere que não sobrou nenhum dado real (CPF válido, e-mail, telefone) e salva em `tests/fixtures/ce-nfse-modal.html`.
- **Aceite:** fixture com os 37 rótulos, estrutura `eui-*` preservada e zero dados reais.

#### WP0.3 — Contratos e modelo
- **Impl:** Implementador · **Dep:** WP0.1 · **Onda:** B
- `core/model`: tipos da arquitetura §5.2 + schemas Zod + `schemaVersion` + esqueleto de migrações.
- Interfaces: `FieldAdapter`, `Locator`, `ConfigRepository`, `RunReport`, mensagens entre contextos.
- `presets/ce-nfse.json` (regra §5.3), validado pelo schema.
- **Aceite:** testes de schema (regra válida passa; regras inválidas falham com mensagem clara). **Revisão obrigatória do orquestrador antes da Onda C.**

#### WP0.4 — Harness de componentes
- **Impl:** Implementador · **Dep:** WP0.1 · **Onda:** B
- Página de teste servida pelo Vite com **Vue 2 + vue-multiselect** reais e inputs nativos, imitando a estrutura `eui-field` da CE (com dados fictícios). Inclui: abrir e fechar um modal, modal que abre já com valores, seção que aparece depois.
- Necessário porque HTML estático não reage a cliques: o adaptador de multiselect precisa de componente vivo.
- **Aceite:** Playwright abre o harness, abre o modal e seleciona uma opção manualmente via script.

#### WP3.1 — Motor de expressões (adiantado)
- **Impl:** Implementador · **Dep:** WP0.1 · **Onda:** B
- Puro, sem DOM e sem Chrome, por isso pode adiantar: parser `{{ fonte | filtro(args) }}`, fontes (`var`, `url.query`, `url.path`, `now`; `field()` e `text()` via callback injetado), filtros da arquitetura §10. Sem `eval`.
- **Aceite:** ≥ 40 testes cobrindo sintaxe, erros, fontes ausentes, `default()` e datas (fuso `America/Sao_Paulo`).

### Fase 1 — Motor (Marco 1)

#### WP1.1 — Locator
- **Impl:** Implementador · **Dep:** WP0.2, WP0.3 · **Onda:** C
- `by: label` (normalização sem `*`, espaços e acentos; `for` → `aria-labelledby` → ancestral comum), `by: selector`, `by: name`. Escopo por contêiner.
- **Aceite:** contra a fixture, localiza "Código NBS" e "Operação de uso ou consumo pessoal" e retorna a raiz `.eui-field`. Rótulo inexistente → `null`. Testes de ambiguidade com `index`.

#### WP1.2 — Adapters `native-text` e `vue-multiselect` + registro
- **Impl:** Implementador · **Dep:** WP0.3, WP0.4 · **Onda:** C
- Implementa `detect`, `read`, `isDefault`, `write` e `verify` (arquitetura §7). Registro com auto-detecção por ordem de especificidade.
- `native-text`: setter nativo + eventos `input`/`change`.
- `vue-multiselect`: abre, clica na opção pelo texto, confere `.multiselect__single`, fecha.
- **Aceite:** unit (happy-dom) para `native-text`. E2E no harness para os dois, incluindo **conferir que o Vue registrou o valor** (o estado do componente reflete a escolha). Opção inexistente → erro reportado, sem efeito colateral.

#### WP1.3 — Watcher
- **Impl:** Implementador · **Dep:** WP0.3 · **Onda:** C
- `MutationObserver` + detecção de navegação SPA. Emite `contextAppeared(el)` / `contextGone(el)` para um gatilho, inclusive quando o modal **perde a classe** `is-active` em vez de sair do DOM. Debounce `settleMs`.
- **Aceite:** testes de aparecer, sumir, reabrir (= nova aparição), mudança de URL sem reload e campos que chegam depois.

#### WP1.4 — Runner (sessão)
- **Impl:** Implementador · **Dep:** WP0.3 · **Onda:** C
- Máquina de estados da arquitetura §6: snapshot → elegibilidade (`onlyIfDefault`/`always`) → preencher → marcar → relatório. Campos tardios. Modos `auto`/`button`/`off`. Usa adapters e locator **por interface** (testado com *fakes*).
- **Aceite:** testes para os cenários: campo vazio preenche; campo já carregado é ignorado; usuário apaga e não re-preenche; fechar e reabrir preenche de novo; campo não encontrado é reportado; expressão não resolvida faz o campo ser pulado.

#### WP1.5 — Integração
- **Impl:** Implementador · **Dep:** WP1.1–1.4 · **Onda:** D
- Content script liga Watcher → Matcher → Runner. Carrega o preset da CE (storage ainda fixo). Toast em Shadow DOM com o resultado. Destaque temporário dos campos preenchidos.
- **Aceite:** extensão buildada preenche o modal do harness. Toast aparece. Nenhum erro no console.

#### WP1.6 — E2E + validação real
- **Impl:** Implementador (E2E) + Orquestrador (validação real) · **Dep:** WP1.5 · **Onda:** D
- Playwright com a extensão carregada no harness: todos os cenários do WP1.4 ponta a ponta.
- Orquestrador: carrega a build no seu Chrome, abre o link da NFS-e e confere os dois campos preenchidos + os cenários "apagar" e "reabrir". **Não emite.**
- **Marco 1 → você testa no dia a dia antes de seguir.**

### Fase 2 — Configuração (Marco 2)

#### WP2.1 — Storage + mensagens
- **Impl:** Implementador · **Dep:** Marco 1 · **Onda:** E
- `ChromeSyncRepository` (uma chave por regra + índice; respeita 8 KB/item), `storage.local` para histórico, migrações, *seed* do preset na instalação, `onChange` propagando para as abas abertas. Canal de mensagens tipado entre popup, options, background e content.
- **Aceite:** testes com mock de `chrome.storage`. Regra grande demais gera erro claro. Mudança no options reflete na aba sem reload.

#### WP2.3 — Options (editor)
- **Impl:** Implementador · **Dep:** WP2.1 · **Onda:** F
- Lista de regras por site, editor (gatilho, comportamento, tabela de campos), validação Zod em tempo real, importar e exportar JSON, histórico.
- **Aceite:** criar, editar, duplicar e excluir regra. Importar um JSON inválido mostra o erro sem corromper a config.

#### WP2.4 — Popup
- **Impl:** Implementador · **Dep:** WP2.1 · **Onda:** F
- Regras que valem para a aba, último relatório campo a campo, "Preencher agora", "Pausar neste site".
- **Aceite:** E2E no harness para os três botões.

#### WP2.5 — Modo botão + desfazer
- **Impl:** Implementador · **Dep:** WP2.1 · **Onda:** F
- Botão flutuante (`mode: button`). "Desfazer" no toast restaura os valores do snapshot.
- **Aceite:** E2E dos dois fluxos.

**Marco 2:** orquestrador valida na CE em dois perfis do Chrome (simula dois dispositivos) que a edição sincroniza.

### Fase 3 — Dinâmico (Marco 3)

#### WP3.2 — Variáveis + preview
- **Impl:** Implementador · **Dep:** WP3.1, WP2.3 · **Onda:** G
- Tela de variáveis. Integra o motor de expressões ao Runner (`field()`/`text()` resolvem na página). Pré-visualização do valor resolvido no editor, usando a aba atual.

#### WP4.1 — Adapters extras
- **Impl:** Implementador · **Dep:** Marco 1 · **Onda:** G
- `native-select`, `native-choice` (radio e checkbox), `date` (nativo e mascarado). Harness ampliado.

#### WP4.3 — Permissões e registro dinâmico
- **Impl:** Implementador · **Dep:** WP2.1 · **Onda:** G
- `optional_host_permissions`, pedido ao salvar uma regra de site novo, `registerContentScripts` só para sites com regras, re-registro ao mudar regras.

### Fase 4 — Genérica (Marco 4)

#### WP4.2 — Capturar campo
- **Impl:** Implementador · **Dep:** WP2.3, WP4.1 · **Onda:** H
- Modo seletor (overlay em Shadow DOM): hover destaca o campo, o clique descobre rótulo + adapter + contêiner e abre o editor pré-preenchido.

#### WP4.4 — Regras para energia e água
- **Impl:** Orquestrador + você · **Dep:** WP4.2, WP4.3 · **Onda:** H
- Você indica os portais. Orquestrador inspeciona (como fizemos na CE) e cria adapters novos se precisar (Implementador). As regras são criadas **por você** pela interface, para validar a experiência.

### Fase 5 — Opcional
- **WP5.1** API mínima + `RemoteRepository` (servidor próprio). Só se o `storage.sync` não bastar.

## 4. Portões de qualidade (todo WP)

1. `pnpm typecheck` — zero erros (TS strict).
2. `pnpm lint` — zero erros.
3. `pnpm test` — passa. Código novo com testes.
4. `pnpm build` — gera a extensão.
5. `pnpm e2e` — quando o WP toca comportamento na página.
6. Revisão do orquestrador: aderência ao brief e à arquitetura, sem arquivos fora do escopo, sem dependências não aprovadas, sem dados reais.

## 5. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| A CE muda o HTML do modal | Localização por rótulo; aviso "campo não encontrado"; fixture atualizável (WP0.2 repetível) |
| vue-multiselect não registra o valor via eventos sintéticos | WP0.4 testa com componente real antes de tudo; plano B: interação por teclado (digitar + Enter) |
| Subagente sai do escopo ou muda contratos | Escopo fechado no brief + revisão de diff + worktrees isolados |
| Dados reais de clientes vazarem para fixtures ou commits | Anonimização no navegador + verificação Verificador + revisão |
| Limites do `storage.sync` | Uma chave por regra, aviso de tamanho, `RemoteRepository` como saída |
| Regressões entre fases | Suíte E2E acumulativa rodada em todo WP |

## 6. Decisões antes de começar

| # | Decisão | Padrão proposto |
|---|---|---|
| D1 | UI em Vue 3 | Sim |
| D2 | Nome da extensão | "Assistente de Preenchimento" (ajustável a qualquer momento) |
| D3 | Botão "desfazer" | Sim, no WP2.5 |
| D4 | `git init` + um commit local por WP aprovado (sem push, sem atribuição a IA) | Sim |
| D5 | Orquestrador pode **preencher** (nunca emitir) o modal real da CE para validar | Sim, só no WP0.2 (leitura) e nos marcos |
| D6 | Gerenciador de pacotes | pnpm |
