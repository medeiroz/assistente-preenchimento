# Plano de Melhorias (pós-1.0)

> Complementa [arquitetura.md](arquitetura.md) e segue o modelo de trabalho de
> [plano-de-execucao.md](plano-de-execucao.md) (papéis, ciclo do WP, template de brief, portões de
> qualidade). Data: 2026-11-15. Base: v1.0.2. Status: implementação concluída (ver §0).
>
> **Fora deste plano:** atalhos de teclado (`commands`).

## 0. Status da execução (2026-11-15)

Todos os WPs de implementação foram entregues, revisados e verificados (typecheck, lint, unit,
Prettier, build, E2E e, no F1, build e `web-ext lint` do Firefox).

| WP | Status | Onde |
| --- | --- | --- |
| A0 1.0.3 tolerante | Concluído | `main` |
| A1 Contratos, A2 Refatoração, A3 Preset neutro | Concluídos | `next` |
| B1 http, B2 Shadow DOM, B3 Filtros, B4 Adapters | Concluídos | `next` |
| C1 Iframes, C2 Várias regras, C3 Variáveis locais | Concluídos | `next` |
| D1 Menu de contexto, D2 Medidor, D3 Acessibilidade | Concluídos | `next` |
| E1 Internacionalização | Concluído | `next` |
| F1 Build Firefox | Concluído | `next` |
| A4 / F2 Publicação nas lojas | **Pendente: dono do projeto** | ver `store/PUBLICAR.md` |
| C4 Adapters II | Sob demanda | — |

Ajustes feitos durante a execução:

- Os ids dos novos adaptadores entraram no B4, junto com as implementações (não no A1).
- Reivindicação de campo (C2) vale também para "Preencher agora".
- O CI deixou de bloquear `localhost` puro no pacote (a exceção de loopback do aviso de http é
  legítima) e passou a procurar os padrões do build de testes, também no job `verify`.
- Os marcos 1.1/1.2/1.3 viraram uma versão só (1.1.0), porque nada foi publicado no meio.

Validação manual pendente (não automatizável): concessão real de permissão http, menu de contexto
nativo, iframe com topo sem motor e pausa sem `ancestorOrigins`, e o roteiro do Firefox em
`store/PUBLICAR.md` §8.

Melhorias futuras observadas: o catálogo pt-BR vai embutido em cada ponto de entrada (+~45 kB
cada); `vue-multiselect` e contêiner do gatilho dentro de shadow DOM; captura pela gravação dentro
de iframes; Select2 `multiple` e React-Select `isMulti`.

### Revisão 1 (2026-11-15)

Mudanças em relação ao primeiro rascunho, depois de conferir as premissas no código:

1. **Compatibilidade entre versões sincronizadas.** A 1.0.x mostra configuração vazia ao ler
   `schemaVersion` maior que 1 ([migrations.ts](../src/core/model/migrations.ts)). Também descarta
   regras com adaptador desconhecido e remove campos desconhecidos ao salvar (Zod `strip`). Dois
   dispositivos em versões diferentes no mesmo `storage.sync` perderiam dados. Agora: novo WP-A0
   (1.0.3 tolerante, publicada primeiro), e os campos novos são **aditivos e opcionais**, sem
   subir o `schemaVersion`.
2. **Releases automáticas.** Cada push na `main` gera uma Release. Os WPs agora integram num ramo
   `next`, e a `main` só recebe em cada marco.
3. **Iframes.** O frame de topo pode não ter o content script (site sem regra ou permissão), então
   o toast "sempre no topo" falharia. `sender.tab.url` só vem com permissão para o host da aba.
   Corrigidos a UI (topo quando houver motor lá, senão no próprio frame), a pausa e o estado do
   popup (registro dos frames no background).
4. **Várias regras.** Reivindicar o campo não basta com regras rodando em paralelo. Agora as regras
   preenchem em ordem de prioridade dentro da mesma aparição.
5. **Escopo dos WPs.** A sintaxe de seletor com shadow DOM foi para o WP de contratos (B2 não pode
   mexer no schema). README e `store/` passam a ser editados só pelo orquestrador, no fecho de cada
   onda. O menu de contexto não depende mais de C2.
6. **Testabilidade.** O prompt nativo de permissão não é automatizável (os E2E só simulam a
   recusa). Os critérios de aceite de http e de iframe de outra origem foram ajustados. O harness
   empacota as bibliotecas por `devDependencies` + esbuild, como já faz com Vue 2, e não por uma
   pasta `vendor/`.
7. **Menu de contexto.** Em site sem content script, o elemento clicado já se perdeu quando o menu
   é usado. O item cai no modo "Capturar campo" normal.
8. **i18n.** `core/` continua sem depender do Chrome (tradutor injetado). Os E2E seguem em pt-BR,
   com só um smoke em inglês, em vez de reescrever seletores.
9. **Priorização.** Coluna de valor/esforço, e os adaptadores da segunda leva (C4) só entram sob
   demanda.

## 1. Objetivos

| #   | Tema                    | Problema hoje                                                                                       | Resultado esperado                                                                       | Valor | Esforço |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- | ------- |
| M0  | Compatibilidade de sync | 1.0.x zera, descarta ou remove dados de versões mais novas                                          | Versões diferentes convivem no mesmo `storage.sync` sem perda                            | Alto  | Baixo   |
| M1  | Iframes                 | `allFrames: false`: formulário dentro de iframe nunca é preenchido                                  | Regras funcionam em iframes (mesma origem e, com permissão, outra origem)                | Alto  | Alto    |
| M2  | Sites `http://`         | `optional_host_permissions` só cobre `https://*/*`; regra http passa na validação e não tem como ser concedida | Sites http (intranets, sistemas locais) suportados, com aviso de conexão insegura        | Alto  | Baixo   |
| M3  | Shadow DOM              | Locator e captura não entram em `shadowRoot`                                                        | Campos em web components localizados, capturados e preenchidos                           | Médio | Médio   |
| M4  | Novos adaptadores       | Só `native-*`, `date`, `vue-multiselect`                                                            | `contenteditable`, React-Select, Select2 (e, sob demanda, MUI/Ant/Element/Vuetify)       | Médio | Médio   |
| M5  | Menu de contexto        | Capturar e preencher só pelo popup                                                                  | Botão direito: "Capturar este campo" e "Preencher com…"                                  | Médio | Médio   |
| M6  | Várias regras na página | Duas regras `auto` podem escrever no mesmo campo, sem ordem definida                                | Prioridade por regra, um campo é de uma regra só por aparição, aviso de sobreposição     | Médio | Médio   |
| M7  | Variáveis locais        | Toda variável sincroniza pela conta Google                                                          | Variável "só neste navegador" fica em `storage.local` e não vai no export por padrão     | Médio | Baixo   |
| M8  | Expressões              | Sem condição, conta ou formato numérico                                                             | Filtros novos: condição, mapa, aritmética, número e moeda pt-BR                          | Médio | Baixo   |
| M9  | Publicação Chrome/Edge  | README sem link da loja                                                                             | Publicada na Chrome Web Store e na Edge Add-ons                                          | Alto  | Baixo   |
| M10 | Firefox                 | Só build Chrome                                                                                     | Build Firefox (MV3) no CI e no release, publicado na AMO                                 | Médio | Médio   |
| M11 | Internacionalização     | Interface só em pt-BR                                                                               | `_locales` pt-BR + en, extensão e loja em dois idiomas                                   | Médio | Alto    |
| M12 | Preset neutro           | Estado inicial oferece "Importar exemplo da Clínica Experts"                                        | Exemplo genérico e fictício; `presets/ce-nfse.json` continua como arquivo                | Baixo | Baixo   |
| M13 | Manutenção              | `popup/App.vue` (530), `draft.ts` (500), `options/App.vue` (473)                                    | Arquivos divididos por responsabilidade, sem mudança de comportamento                    | Médio | Médio   |
| M14 | Limite de 8 KB          | Erro só aparece ao salvar                                                                           | Medidor de tamanho no editor de regra e na tela de variáveis                             | Baixo | Baixo   |
| M15 | Acessibilidade          | Popup, toast, botão e overlay sem revisão                                                           | Navegável por teclado, rótulos ARIA, contraste AA, anúncio do toast                      | Médio | Médio   |

Se for preciso cortar, a ordem de corte sugerida é: C4 → M11 → M10 → M5. M0, M2 e M9 não devem ser
cortados: são baratos e destravam o resto.

## 2. Fluxo de ramos e versões

- Ramo de integração **`next`**, criado a partir da `main`. Cada WP é um ramo próprio (worktree)
  com PR para `next`. Os PRs rodam todos os checks do CI, que já roda em `pull_request`.
- A `main` só recebe `next` **em cada marco**, por PR. Assim a release automática gera uma versão
  por marco, não uma por WP.
- Exceção: o WP-A0 vai direto para a `main` (é a 1.0.3, que vai para a loja).
- Versões: Marco 1 → 1.1.0, Marco 2 → 1.2.0, Marco 3 → 1.3.0 (`version` do `package.json` ajustada
  no PR do marco, conforme a regra do README).
- **README e `store/` são editados só pelo orquestrador**, no PR de cada marco. Os WPs entregam um
  trecho de documentação no resumo, e isso evita conflito entre WPs paralelos.

## 3. Visão das ondas

```
Onda 0  ─ WP-A0 1.0.3 tolerante (M0) ──► main ──► WP-A4 Publicar 1.0.3 Chrome/Edge (M9, você)
             │
Onda A  ─ WP-A1 Contratos aditivos ─┬─ WP-A2 Refatoração (M13) ─┬─ WP-A3 Preset neutro (M12)
             │
Onda B  ─ WP-B1 http (M2) ─┬─ WP-B2 Shadow DOM (M3) ─┬─ WP-B3 Filtros (M8) ─┬─ WP-B4 Adapters (M4)
             │                                       ◄── MARCO 1 (1.1.0): mais sites e valores
Onda C  ─ WP-C1 Iframes (M1) ─┬─ WP-C2 Várias regras (M6) ─┬─ WP-C3 Variáveis locais (M7)
             │                                       ◄── MARCO 2 (1.2.0): cobertura de páginas
Onda D  ─ WP-D1 Menu de contexto (M5) ─┬─ WP-D2 Medidor 8 KB (M14) ─┬─ WP-D3 Acessibilidade (M15)
             │
Onda E  ─ WP-E1 Internacionalização (M11)
             │
Onda F  ─ WP-F1 Build Firefox (M10) ── WP-F2 Publicar nas três lojas (você)
                                                     ◄── MARCO 3 (1.3.0)
Sob demanda ─ WP-C4 Adapters II (MUI/Ant/Element/Vuetify), quando um site real pedir
```

**Por que esta ordem:**

- **Compatibilidade primeiro**: depois de publicada, a 1.0.3 é a versão mais antiga em uso. Tudo o
  que vier depois só precisa ser legível por ela.
- **Contratos e refatoração antes das features**: quase todo WP mexe no schema, nas mensagens ou
  nos três arquivos grandes.
- **http antes de iframes**: os dois mexem em `shared/permissions.ts` e no registro do script.
- **i18n no fim**: toca todas as strings de UI. Feito antes, todo WP seguinte teria de lidar com as
  chaves de tradução.
- **Firefox depois do i18n**: os dois mexem em `wxt.config.ts`, e o Firefox ganha o i18n pronto.

## 4. Pacotes de trabalho

Legenda: **Impl** = quem executa · **Dep** = dependências · **Escopo** = lista fechada de arquivos
que o WP pode criar ou alterar (o brief detalha).

### Onda 0 — Compatibilidade

#### WP-A0 — 1.0.3 tolerante a versões mais novas (M0)

- **Impl:** Implementador · **Dep:** — · **Onda:** 0 · **Destino:** `main`
- `core/model/schema.ts`: `RuleSchema`, `FieldRuleSchema`, `TriggerSchema`, `BehaviorSchema`,
  `VariableSchema` e `SettingsSchema` passam a **preservar chaves desconhecidas** (`z.looseObject`
  ou `.passthrough()`). Salvar uma regra editada numa versão antiga não apaga campos da nova.
- Adaptador desconhecido em `FieldRule.adapter`: em vez de descartar a regra, o campo é lido como
  `auto` **só em memória**. O valor original é mantido ao salvar (guardado em chave preservada).
- `migrateConfig` com `schemaVersion` maior que o atual: carrega o que conseguir validar e marca a
  configuração como **somente leitura**. As Configurações mostram "Esta configuração foi salva por
  uma versão mais nova. Atualize a extensão para editar." e bloqueiam salvar, importar e substituir.
  O motor continua preenchendo.
- **Aceite:** testes de: regra com chave extra (lê, salva, chave continua lá), adaptador
  desconhecido (regra não descartada, adaptador preservado ao salvar), `schemaVersion: 2` (carrega,
  somente leitura, nenhum `set` no storage). E2E do aviso de somente leitura.

#### WP-A4 — Publicar a 1.0.3 na Chrome Web Store e na Edge (M9)

- **Impl:** **Você** (conta de desenvolvedor, taxa, envio) + Orquestrador (checklist) · **Dep:**
  WP-A0 · **Onda:** 0
- Seguir [store/PUBLICAR.md](../store/PUBLICAR.md) com o zip da Release 1.0.3. A Edge Add-ons aceita
  o mesmo zip.
- Orquestrador confere antes do envio: justificativa de cada permissão, política de privacidade
  publicada, capturas atualizadas, descrição sem promessas que a extensão não cumpre.
- Depois da aprovação, o orquestrador põe o link da loja no README.
- **Aceite:** item publicado (pode começar "não listado") e link no README.

### Onda A — Fundação

#### WP-A1 — Contratos aditivos

- **Impl:** Implementador · **Dep:** WP-A0 · **Onda:** A
- **Revisão obrigatória do orquestrador antes da Onda B.**
- **`schemaVersion` continua 1.** Todo campo novo é opcional, com padrão aplicado na leitura. A
  1.0.3 lê e preserva tudo (WP-A0).
- `core/model/schema.ts`:
  - `Rule.priority?: number` (int, 0–100; ausente = 50). Maior vence (M6).
  - `Variable.scope?: 'sync' | 'local'` (ausente = `sync`). Variável `local` grava no sync só `key`,
    `label`, `scope` e `value: ''`. O valor real fica em `storage.local` (M7).
  - `AdapterIdSchema` ganha `contenteditable`, `react-select` e `select2` (M4). Os ids da segunda
    leva entram só no WP-C4.
  - `Trigger.frames?: 'top' | 'all'` (ausente = `top`, comportamento atual) (M1).
  - `Locator` `by: 'selector'` aceita a cadeia `host >>> interno` para atravessar shadow roots
    abertos. Validação e mensagem de erro no schema (M3).
- `shared/messages.ts`:
  - `frame/hello` (frame → background, ao iniciar o motor) e `frame/bye`.
  - `frame/report` (frame filho → background → frame de topo, quando houver motor lá).
  - `tab/status` passa a ser respondido **pelo background**, agregando os frames registrados.
- `core/locator/types.ts`: contrato `DeepQuery` (consulta que atravessa shadow roots abertos, em
  ordem de documento, com limite de profundidade).
- **Aceite:** testes de schema para cada campo novo (ausente, válido, inválido). Config exportada da
  1.0.2 continua válida sem transformação. Teste de ida e volta: config com os campos novos → 1.0.3
  (schema do A0) → salva → campos novos intactos.

#### WP-A2 — Refatoração dos arquivos grandes (M13)

- **Impl:** Implementador · **Dep:** — (paralelo ao A1, arquivos disjuntos) · **Onda:** A
- `popup/App.vue` → componentes por bloco (status, ações das regras, captura, gravação) + composable
  de estado da aba. Os nomes finais vão no brief.
- `options/composables/draft.ts` → separar conversão regra↔rascunho, validação e operações de
  campo. `draft.ts` reexporta para não mudar imports existentes.
- `options/App.vue` → extrair navegação por abas e o estado de carregamento e erro.
- **Regra:** nenhuma mudança de comportamento, de texto ou de seletor usado nos E2E.
- **Aceite:** suíte unit e E2E inteira passa **sem alterar nenhum teste**. Nenhum arquivo de UI acima
  de ~300 linhas.

#### WP-A3 — Preset neutro (M12)

- **Impl:** Implementador · **Dep:** — · **Onda:** A
- Novo `presets/exemplo-cadastro.json`: regra fictícia (formulário de cadastro em
  `https://exemplo.test/*`) que mostra rótulo, variável, data e `default()`.
- Estado inicial de `RuleList.vue`: "Importar exemplo" usa o preset neutro. `presets/ce-nfse.json`
  continua no repositório.
- **Aceite:** E2E do estado inicial importa o preset neutro. `publicacao.spec.ts` atualizado. Nenhuma
  menção a "Clínica Experts" no build de produção (o build e2e pode manter o host de teste).

### Onda B — Mais sites e valores (Marco 1 → 1.1.0)

#### WP-B1 — Suporte a `http://` (M2)

- **Impl:** Implementador · **Dep:** WP-A1 · **Onda:** B
- `wxt.config.ts`: `optional_host_permissions: ['https://*/*', 'http://*/*']`.
- `shared/permissions.ts`: `isSupportedOrigin` aceita http. Padrão `*://` passa a gerar as **duas**
  origens. `classifyOrigins` ganha o balde `insecure` (http), que só gera aviso e não bloqueia.
- Editor e lista de regras: selo "conexão não segura" em regra http, explicando que os valores
  trafegam sem criptografia.
- **Aceite:** unit de `toOriginPattern`, `originsForRule` e `classifyOrigins` para http, https,
  `*://` e porta. E2E com `http://exemplo-sem-permissao.test/*` (fora do que o build e2e cobre): a
  regra vai para "precisa de permissão", não para "não suportada", e mostra o selo. A concessão
  real é conferida pelo orquestrador no marco, porque o prompt nativo não é automatizável.
- **Risco:** a revisão da loja pode questionar `http://*/*`. A justificativa (continua opcional,
  pedida por site) entra em `store/privacy-practices.md` no PR do marco.

#### WP-B2 — Shadow DOM (M3)

- **Impl:** Implementador · **Dep:** WP-A1 · **Onda:** B
- `core/locator/`: implementar `DeepQuery`, com caminho rápido quando a página não tem shadow roots.
  `locate`, `locateAll`, `collectCandidates` e `locateByName` usam essa consulta. `label[for]`
  resolve dentro da mesma árvore. Seletores com `>>>` seguem o contrato do A1.
- `core/locator/capture.ts` + `content/picker/`: o clique usa `event.composedPath()` para achar o
  campo real dentro do shadow root. O locator gerado prefere o rótulo. Com seletor, gera a cadeia
  `>>>`.
- `core/engine/watcher.ts`: observar mutações dentro dos shadow roots abertos que contêm campos.
- Harness: página com custom elements nativos (sem dependência nova), com rótulo dentro e fora do
  shadow.
- **Aceite:** unit do `DeepQuery` (aninhado, `closed` ignorado, ordem). E2E: capturar e preencher
  campo dentro de shadow root. `perf.spec.ts` sem regressão em página sem shadow DOM.
- **Fora do escopo:** shadow roots `closed`, que são inacessíveis por design.

#### WP-B3 — Filtros novos nas expressões (M8)

- **Impl:** Implementador · **Dep:** — (puro) · **Onda:** B
- Só filtros. A gramática `{{ fonte | filtro(args) }}` não muda, então o parser fica intacto.
- Condição e mapeamento:
  - `when("valor", "então", "senão")`: compara a entrada com `valor`.
  - `ifEmpty("x")`: como `default`, mas também troca string vazia.
  - `map("A=1;B=2", "padrão")`.
- Aritmética: `add(n)`, `sub(n)`, `mul(n)`, `div(n)`, `round(casas)`. A entrada é lida como número
  pt-BR (`1.234,56`) ou com ponto decimal (`1234.56`). A regra de ambiguidade (`1.234`) é decidida
  e documentada no brief. Se não for número, a expressão não resolve e o campo é pulado.
- Formato: `number(casas)` → `1.234,56`; `money` → `R$ 1.234,56`, via `Intl.NumberFormat('pt-BR')`.
- Se o tokenizer ainda não aceitar decimais, entra o tipo de argumento `decimal` em `filters.ts`.
- Ajuda da pré-visualização (`ValuePreview`) atualizada. O texto para o README vai no resumo do WP.
- **Aceite:** ≥ 30 testes novos (divisão por zero, número inválido, arredondamento documentado,
  negativos, ambiguidade de milhar, encadeamento `| add(1) | money`).

#### WP-B4 — Adapters: `contenteditable`, React-Select, Select2 (M4)

- **Impl:** Implementador · **Dep:** WP-A1 · **Onda:** B
- `contenteditable`: escreve com `beforeinput`/`input`, sem `execCommand`. `clear` suportado.
- `react-select`: o React ignora o setter de valor comum, por isso usa o setter nativo do protótipo
  + `input` para filtrar. Depois escolhe a opção pelo texto e confere o valor exibido.
- `select2`: atualiza o `<select>` oculto e dispara `change` (o Select2 escuta via jQuery),
  conferindo o rótulo visível.
- Harness: bibliotecas como `devDependencies` (React, react-dom, react-select, jQuery, select2),
  empacotadas por esbuild como já acontece com Vue 2 em `tests/e2e/bundle.ts`. Nada disso entra no
  pacote da loja (`publicacao.spec.ts` confere).
- Prioridades no registro: bibliotecas acima de `native-select`, `contenteditable` acima de
  `native-text`.
- **Aceite:** E2E por adapter: preenche, o estado da biblioteca muda, opção inexistente é reportada
  sem efeito colateral, desfazer funciona. Detecção `auto` correta em página mista.

**Marco 1:** orquestrador valida no harness e concede uma permissão http de verdade no Chrome. Você
testa num site http real, se tiver. PR `next` → `main` com `version` 1.1.0.

### Onda C — Cobertura de páginas (Marco 2 → 1.2.0)

#### WP-C1 — Iframes (M1)

- **Impl:** Implementador · **Dep:** WP-A1, WP-B1 · **Onda:** C
- **Modelo:** cada frame roda o próprio motor e casa a regra com a **URL do próprio frame**. Num frame
  filho só rodam regras com `frames: 'all'`.
- Registro: um único script. `allFrames: true` + `matchOriginAsFallback: true` (frames
  `about:blank`/`srcdoc`) só quando alguma regra ativa tem `frames: 'all'`. As origens já saem como
  `scheme://host/*`, que é o formato exigido. A injeção sob demanda do popup passa a usar
  `allFrames`.
- Iframe de **outra origem** precisa de permissão para aquela origem. A captura dentro do iframe gera
  o padrão de URL do iframe, já com `frames: 'all'`, e pede essa permissão ao salvar. O editor
  mostra "esta regra atua em iframes".
- **Registro de frames:** cada motor manda `frame/hello` ao iniciar. O background guarda
  `{tabId, frameId, url, regras ativas, último relatório}` em `storage.session` (sobrevive ao
  service worker dormir) e responde o `tab/status` do popup. `run/now` e `run/undo` vão para o
  `frameId` certo.
- **Pausa:** vale pelo host de topo. O frame usa `location.ancestorOrigins` (Chrome). Sem ele, usa a
  URL de topo do background, se houver permissão para a aba, e por último o host do próprio frame.
- **UI:** se o frame de topo tem motor registrado, toast e botão de ação aparecem lá (relay
  `frame/report`). Se não tem (site de topo sem regra nem permissão), aparecem no próprio iframe. O
  destaque do campo fica sempre no frame do campo.
- Harness: iframe de mesma origem, `srcdoc` e de outra porta (outra origem, coberta pelo build e2e).
- **Aceite:** E2E dos três casos (preencher, desfazer, relatório no popup, captura dentro do
  iframe). Regra sem `frames` não roda em iframe (sem regressão). Unit do registro de frames
  (entrada, saída, navegação do frame, aba fechada).
- **Risco:** é o WP mais delicado. Se passar de 2 voltas, dividir em C1a (mesma origem + `srcdoc` +
  registro de frames) e C1b (outra origem + captura + UI no topo).

#### WP-C2 — Várias regras na mesma página (M6)

- **Impl:** Implementador · **Dep:** WP-A1, WP-A2 · **Onda:** C
- `core/engine/controller.ts`: quando várias regras `auto` aparecem no mesmo contêiner, preenchem
  **em sequência, por prioridade**. Hoje as sessões rodam em paralelo. Cada raiz de campo
  preenchida é reivindicada pela regra. Outra regra que localize o mesmo campo o pula com o motivo
  "preenchido pela regra X". Empate: ordem de `ruleIds`. Regras em contêineres diferentes continuam
  em paralelo.
- O desfazer de cada regra só restaura os campos que ela reivindicou.
- Modo botão: até 2 regras, os botões continuam empilhados como hoje. Com 3 ou mais, viram um botão
  "Preencher…" com menu.
- Editor: campo "Prioridade" (avançado) e aviso "outra regra também atua nestas páginas: *nome*",
  quando os `urlPatterns` se sobrepõem. A checagem é heurística e o texto diz "pode".
- **Aceite:** unit do controller (duas regras `auto` no mesmo campo com `overwrite: always`,
  prioridade, empate, regra desligada, desfazer parcial). E2E do menu com 3 regras em modo botão.

#### WP-C3 — Variáveis só neste navegador (M7)

- **Impl:** Implementador · **Dep:** WP-A1 · **Onda:** C
- `core/storage/`: valores locais em `storage.local` (chave `vars:local`). `load()` mescla o sync com
  o local. `onChange` reage às duas áreas.
- `VariablesView.vue`: alternância "sincronizar / só neste navegador", com o aviso sobre senhas
  atualizado. Variável local sem valor neste navegador aparece como "sem valor aqui" e, na
  expressão, conta como ausente.
- Export: valores locais **fora** por padrão. Caixa "incluir valores locais", com aviso. Import de
  variável local sem valor mantém a chave.
- **Aceite:** unit do merge, do export e da troca de escopo: sync→local zera o valor no sync, e
  local→sync o leva de volta. E2E com dois contextos de navegador: o valor local não aparece no
  outro.

**Marco 2:** você usa no dia a dia por uma semana com pelo menos um site com iframe ou duas regras.
PR `next` → `main` com `version` 1.2.0.

### Onda D — Uso e qualidade

#### WP-D1 — Menu de contexto (M5)

- **Impl:** Implementador · **Dep:** WP-C1 (`frameId` e registro de frames) · **Onda:** D
- Permissão `contextMenus`, que não gera aviso de instalação.
- Itens:
  - **Capturar este campo** (só em campos editáveis). O content script guarda o alvo do último
    evento `contextmenu`. Se a página não tem content script, o elemento já se perdeu, então o item
    injeta via `activeTab` (o clique no menu concede) e abre o modo "Capturar campo" normal.
  - **Preencher com ›**: submenu com as regras ativas da aba, vindas do registro de frames.
  - **Pausar neste site**.
- Os menus do Chrome são globais, sem estado por aba. O background reconstrói o submenu em
  `tabs.onActivated`, em `frame/hello` e em `frame/bye`. Pode haver um instante de menu
  desatualizado, e isso fica documentado.
- **Aceite:** unit da montagem do menu (registro de frames → itens) e do handler de
  `contextMenus.onClicked`. O menu nativo não é automatizável no Playwright, por isso o fluxo
  completo é conferido pelo orquestrador no Marco 3.

#### WP-D2 — Medidor de tamanho (M14)

- **Impl:** Implementador · **Dep:** WP-A2 · **Onda:** D
- Exportar de `chrome-sync.ts` uma função pura `measureItem(key, value)`, usada também por
  `assertFits`. `RuleEditor` e `VariablesView` mostram "3,1 KB de 8 KB", com cor a partir de 75%,
  atualizando com o rascunho.
- Uso total do `storage.sync` (100 KB) na aba Importar/Exportar.
- **Aceite:** unit de `measureItem`. E2E: regra grande mostra o aviso antes de salvar.

#### WP-D3 — Acessibilidade (M15)

- **Impl:** Implementador · **Dep:** WP-A2 · **Onda:** D
- Auditoria com `@axe-core/playwright` (dependência só de desenvolvimento) no popup, nas
  Configurações e na página do harness com toast, botão e overlay de captura. O axe precisa ser
  injetado também dentro dos shadow roots da UI da página.
- Correções: foco visível e ordem de Tab, `aria-live` no toast, `Esc` fecha overlay e menus, rótulo
  em botões só com ícone, contraste AA.
- **Aceite:** axe sem violações `serious`/`critical` nas telas auditadas, como teste E2E no CI.

### Onda E — Idiomas

#### WP-E1 — Internacionalização (M11)

- **Impl:** Implementador · **Dep:** Ondas A–D integradas em `next` · **Onda:** E
- `public/_locales/{pt_BR,en}/messages.json`, `default_locale: 'pt_BR'`, nome e descrição do
  manifest via `__MSG_*__`.
- `core/` continua sem depender do Chrome. As mensagens de validação e de erro de expressão passam
  a sair como **código + parâmetros**, e a tradução acontece em `entrypoints/` com um helper
  `t(key, ...subs)` sobre `browser.i18n.getMessage` (sem dependência nova).
- Vue: função global no popup e nas Configurações. Content script: toast, botão, overlay e barra de
  gravação.
- Nomes de filtros e fontes das expressões **não** são traduzidos.
- `store/listing-en.md` e capturas em inglês: o orquestrador redige no PR do marco, e o script de
  capturas ganha a opção de locale.
- **Aceite:** teste unit que falha se uma chave usada no código não existir nos dois idiomas, ou se
  sobrar chave sem uso. Os E2E existentes continuam em pt-BR (padrão) **sem mudança**. Um smoke novo
  roda popup e Configurações com `--lang=en`.

### Onda F — Firefox e publicação (Marco 3 → 1.3.0)

#### WP-F1 — Build Firefox (M10)

- **Impl:** Implementador · **Dep:** WP-E1 · **Onda:** F
- `wxt build -b firefox` (MV3) com `browser_specific_settings.gecko.id` e versão mínima definida no
  brief.
- **Conferir na documentação atual do Firefox**, sem assumir:
  - suporte a `persistAcrossSessions`; se não houver, re-registrar o script em `runtime.onStartup`;
  - suporte a `matchOriginAsFallback` e a `location.ancestorOrigins` (WP-C1); se faltar, usar a URL
    de topo pelo background;
  - comportamento das permissões de host no MV3, que o usuário pode revogar a qualquer momento:
    re-sincronizar o registro em `permissions.onRemoved`.
- CI: job de build + unit para Firefox e `web-ext lint`. E2E no Firefox só se o Playwright carregar
  extensões nele; senão, validação manual no marco.
- Release: zip Firefox + sha256 anexados à mesma Release. A AMO pede o código-fonte de pacotes
  empacotados: gerar também o zip do fonte, com instruções de build.
- **Aceite:** `web-ext lint` sem erros. Extensão carrega no Firefox e preenche o harness (validação
  do orquestrador).

#### WP-F2 — Publicar nas três lojas (M9, M10)

- **Impl:** **Você** + Orquestrador (checklist) · **Dep:** Marco 2, WP-F1 · **Onda:** F
- Chrome Web Store e Edge: atualizar o item. As permissões novas (`http://*/*` opcional e
  `contextMenus`) não desativam a extensão na atualização, mas as justificativas precisam ser
  atualizadas. AMO: primeiro envio, com o zip do fonte.
- **Marco 3:** PR `next` → `main` com `version` 1.3.0. README com os três links.

### Sob demanda

#### WP-C4 — Adapters II: MUI, Ant Design, Element Plus, Vuetify (M4)

- **Impl:** Implementador · **Dep:** WP-B4 · **Onda:** quando um site real usar a biblioteca
- Mesmo método do B4, um adapter por biblioteca e por PR. Menus renderizados em portal (fora do
  campo, no fim do `body`) são localizados pelo `aria-controls`/`aria-owns` do combobox.
- Antes, adicionar o id no `AdapterIdSchema`. Por causa do WP-A0, a 1.0.3 já tolera o id novo.
- Dependências pesadas no harness (MUI + Emotion, antd) são aprovadas caso a caso.

## 5. Riscos e mitigação

| Risco                                                           | Mitigação                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Dispositivos com versões diferentes no mesmo `storage.sync`     | WP-A0 publicado antes de tudo, campos só aditivos, `schemaVersion` fixo em 1, teste de ida e volta no A1 |
| Usuário que nunca atualiza da 1.0.2 (antes da 1.0.3)            | Hoje não há instalações pela loja. A 1.0.3 é a primeira publicada, e a 1.0.2 só existe em modo desenvolvedor |
| Iframes de outra origem complicam permissões, mensagens e UI    | WP próprio, divisão prevista em C1a/C1b, registro de frames no background, UI com plano B no frame      |
| Revisão da loja questiona `http://*/*`                          | Continua opcional e pedida por site; justificativa escrita antes do envio                               |
| Bibliotecas de UI mudam a estrutura interna entre versões       | Detecção por papéis ARIA quando possível; harness fixado numa versão; aviso "campo não reconhecido" já existe |
| Shadow DOM deixar o locator lento em páginas grandes            | Caminho rápido sem shadow roots, limite de profundidade, `perf.spec.ts` como portão                     |
| Regras em sequência (C2) atrasarem o preenchimento              | Sequência só entre regras do mesmo contêiner; `perf.spec.ts` com duas regras                            |
| Firefox divergir em APIs de scripting                           | WP no fim, com a base estável; diferenças isoladas atrás das interfaces injetáveis que já existem       |
| Conflito entre WPs paralelos                                    | Escopos disjuntos por onda; README e `store/` só com o orquestrador; ramo `next`                        |

## 6. Decisões antes de começar

| #   | Decisão                                                                                                   | Padrão proposto                 |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| D1  | Publicar a 1.0.3 (tolerante) na Chrome Web Store e Edge antes das features                                | Sim                             |
| D2  | Campos novos só aditivos e opcionais, `schemaVersion` continua 1                                          | Sim                             |
| D3  | Ramo `next` para integração; `main` só nos marcos (1.1.0, 1.2.0, 1.3.0)                                   | Sim                             |
| D4  | Iframes: regra casa com a URL do próprio frame, opção `frames` por regra                                  | Sim, padrão `top`               |
| D5  | Toast e botão de iframes no frame de topo quando houver motor lá; senão, no próprio iframe                | Sim                             |
| D6  | Pedir `http://*/*` como permissão opcional                                                                | Sim, com selo "conexão não segura" |
| D7  | Várias regras: prioridade numérica, preenchimento em sequência, um campo por regra por aparição           | Sim                             |
| D8  | Expressões: só filtros novos, sem operadores (`+`, `?:`) na sintaxe                                       | Sim                             |
| D9  | Moeda e número formatados sempre em pt-BR nesta versão                                                    | Sim                             |
| D10 | Variáveis locais fora do export por padrão                                                                | Sim                             |
| D11 | Idiomas: pt-BR (padrão) e inglês                                                                          | Sim                             |
| D12 | Firefox entra no Marco 3; Safari fora                                                                     | Sim                             |
| D13 | Preset da Clínica Experts sai do estado inicial e fica só como arquivo de exemplo                         | Sim                             |
| D14 | Adapters da segunda leva (MUI, Ant, Element, Vuetify) só sob demanda                                      | Sim                             |
| D15 | Dependências novas só de desenvolvimento: `@axe-core/playwright`, `web-ext` e as bibliotecas do harness   | Sim                             |
