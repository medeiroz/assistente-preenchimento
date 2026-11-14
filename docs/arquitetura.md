# Arquitetura — Extensão de Autopreenchimento Assistido

> Status: proposta (nada implementado). Data: 2026-11-13.

## 1. Visão geral

Extensão do Chrome que **ajuda** em tarefas repetitivas dentro de sites web, começando pelo Clínica Experts (CE) e depois em portais como os de energia e água. A primeira capacidade é **preencher campos automaticamente** a partir de **regras configuráveis pelo próprio usuário**, sem programar.

### Princípios

1. **Assistente, não robô.** A extensão preenche, mas **nunca envia, emite, salva ou confirma** nada. Clicar em "Emitir NFS-e" é sempre do usuário.
2. **Não atropelar o usuário.** Só preenche campos que estão no valor padrão. Se o usuário mexer, a extensão não mexe de novo.
3. **Tudo é configuração.** Sites, gatilhos, campos e valores ficam em regras editáveis pela interface da extensão. O código só traz o *motor*.
4. **Genérica por design.** A CE é só o primeiro site. Nada no motor depende da CE. O que é específico de um site fica nas regras ou num *adaptador* de componente reutilizável.
5. **Falhar alto.** Se um campo não for encontrado (por exemplo, depois de uma atualização do site), o usuário é avisado. Nada falha em silêncio.

## 2. Requisitos

### Funcionais

| # | Requisito |
|---|---|
| RF1 | Detectar quando um contexto alvo aparece na página (URL + elemento, por exemplo um modal) |
| RF2 | Preencher campos de tipos diferentes: texto, número, select nativo, select customizado, radio, checkbox, data |
| RF3 | Modo por regra: **automático**, **com um clique** ou **desligado** |
| RF4 | Política de sobrescrita por regra: **só se estiver no padrão** (default) ou **sempre** |
| RF5 | Não re-preencher na mesma aparição do contexto. Re-preencher só quando o contexto fechar e abrir de novo |
| RF6 | Valores fixos e **dinâmicos** (URL, data, outros campos da página, variáveis do usuário) |
| RF7 | Criar, editar, ativar e desativar regras pela interface da extensão |
| RF8 | Sincronizar configurações entre dispositivos (conta Google) |
| RF9 | Mostrar o resultado de cada execução: preenchido / ignorado / não encontrado / erro |
| RF10 | Exportar e importar configurações (JSON) para backup |

### Não funcionais

- Manifest V3 (padrão atual do Chrome).
- Permissões mínimas: acesso a novos sites pedido **sob demanda**.
- Nenhum dado sai do navegador além da sincronização escolhida.
- Funcionar em SPAs: conteúdo que aparece depois, URL que muda sem recarregar.

## 3. Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Framework de extensão | **WXT** | MV3, TypeScript, hot reload, gera o manifest e cuida de content scripts, popup e options |
| Linguagem | **TypeScript** | O modelo de regras é rico. Tipos evitam regras quebradas |
| UI (popup + options) | **Vue 3** | Leve e produtivo para formulários (editor de regras). React ou Svelte também serviriam |
| Validação de schema | **Zod** | Valida regras importadas e sincronizadas e permite migrar versões |
| Testes unitários | **Vitest + happy-dom** | Adaptadores e motor testados contra HTML salvo |
| Testes E2E | **Playwright** com extensão carregada | Roda contra *fixtures* HTML copiados dos sites reais |

## 4. Componentes

```
┌──────────────────────────────────────────────────────────────┐
│                       Chrome (MV3)                           │
│                                                              │
│  ┌────────────┐   mensagens   ┌──────────────────────────┐   │
│  │  Popup     │◄─────────────►│  Service Worker          │   │
│  │ (aba atual)│               │  - registra content      │   │
│  └────────────┘               │    scripts por site      │   │
│  ┌────────────┐               │  - permissões sob demanda│   │
│  │  Options   │◄─────────────►│  - camada de storage     │   │
│  │ (editor de │               │  - sync / migrações      │   │
│  │  regras)   │               └────────────┬─────────────┘   │
│  └────────────┘                            │                 │
│                                            ▼                 │
│                        ┌────────────────────────────────┐    │
│   Página do site  ◄────│  Content Script (motor)        │    │
│   (CE, energia…)       │  Watcher → Matcher → Runner    │    │
│                        │  Locator · Adapters · Resolver │    │
│                        │  UI na página (toast, botão)   │    │
│                        └────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 Content script (o motor)

Roda na página. É dividido em módulos independentes:

| Módulo | Responsabilidade |
|---|---|
| **Watcher** | Observa a página (`MutationObserver` + mudanças de URL via `popstate` e patch de `pushState`). Avisa quando um contexto aparece ou some |
| **Matcher** | Decide quais regras valem para a URL e o contexto atuais |
| **Runner** | Executa uma regra: localiza campos, decide quais preencher, chama os adaptadores e gera o relatório |
| **Locator** | Encontra o elemento de um campo a partir da descrição na regra (rótulo, seletor…) |
| **Adapters** | Sabem ler, comparar e escrever em cada **tipo de componente** |
| **Resolver** | Calcula valores dinâmicos (expressões `{{ }}`) |
| **Page UI** | Toast de resultado, botão flutuante (modo "um clique") e destaque visual dos campos preenchidos. Tudo dentro de um Shadow DOM para não conflitar com o CSS do site |

### 4.2 Service worker (background)

- **Registro dinâmico de content scripts** (`chrome.scripting.registerContentScripts`): só injeta o motor nos sites que têm regras.
- **Permissões sob demanda** (`chrome.permissions.request`): ao criar uma regra para um site novo, pede acesso só àquele domínio.
- **Storage**: única porta de leitura e escrita das configurações (ver §8).
- Avisa os content scripts quando uma regra muda, para recarregar sem refresh.

### 4.3 Popup

Painel rápido da aba atual:
- regras que valem para esta página e o status de cada uma;
- último relatório (campo a campo);
- botões **"Preencher agora"**, **"Pausar neste site"** e **"Capturar campo"** (ver §9.2).

### 4.4 Options (página de configurações)

Editor completo: sites, regras, campos, variáveis, importar e exportar, histórico (ver §9.1).

## 5. Modelo de dados

### 5.1 Entidades

```
Config
 ├─ settings     (preferências globais)
 ├─ variables[]  (valores reutilizáveis: códigos de consumidor etc.)
 └─ rules[]
      ├─ trigger   (onde e quando)
      ├─ behavior  (modo, sobrescrita, re-preenchimento)
      └─ fields[]
           ├─ locator  (como achar o campo)
           ├─ adapter  (tipo do componente, ou "auto")
           └─ value    (fixo ou expressão)
```

### 5.2 Tipos (TypeScript)

```ts
type Rule = {
  id: string;
  name: string;                 // "CE — NFS-e: NBS e consumo pessoal"
  enabled: boolean;
  trigger: Trigger;
  behavior: Behavior;
  fields: FieldRule[];
  updatedAt: string;
};

type Trigger = {
  urlPatterns: string[];        // match patterns: "https://app.clinicaexperts.com.br/vendas/*"
  queryParams?: Record<string, string>; // ex: { nfe_modal_mode: "new" }
  container?: {                 // contexto dentro da página (modal, seção…)
    selector: string;           // ".eui-modal-wrapper.is-active"
    textContains?: string;      // "Emitir Nota Fiscal de Serviços Eletrônica"
  };
  settleMs?: number;            // espera os campos estabilizarem (default 300)
};

type Behavior = {
  mode: "auto" | "button" | "off";
  overwrite: "onlyIfDefault" | "always";
  refill: "oncePerAppearance";  // única opção por enquanto; deixa espaço para outras
};

type FieldRule = {
  id: string;
  enabled: boolean;
  locator: Locator;
  adapter: "auto" | AdapterId;
  value: string;                // "126029000" ou "{{ var.codigo_energia }}"
  defaultValue?: string;        // como o campo é "no padrão", se diferente de vazio/placeholder
};

type Locator =
  | { by: "label"; text: string; exact?: boolean; index?: number }
  | { by: "selector"; css: string }
  | { by: "name"; name: string };   // atributo name do input

type Variable = { key: string; label: string; value: string };
```

### 5.3 Exemplo: a regra da NFS-e

```json
{
  "id": "ce-nfse-basico",
  "name": "CE — NFS-e: NBS e consumo pessoal",
  "enabled": true,
  "trigger": {
    "urlPatterns": ["https://app.clinicaexperts.com.br/*"],
    "container": {
      "selector": ".eui-modal-wrapper.is-active",
      "textContains": "Emitir Nota Fiscal de Serviços Eletrônica"
    }
  },
  "behavior": { "mode": "auto", "overwrite": "onlyIfDefault", "refill": "oncePerAppearance" },
  "fields": [
    {
      "id": "nbs",
      "enabled": true,
      "locator": { "by": "label", "text": "Código NBS" },
      "adapter": "auto",
      "value": "126029000"
    },
    {
      "id": "consumo-pessoal",
      "enabled": true,
      "locator": { "by": "label", "text": "Operação de uso ou consumo pessoal" },
      "adapter": "auto",
      "value": "Não"
    }
  ]
}
```

> O gatilho usa o **modal** e não os parâmetros da URL, porque o mesmo modal pode ser aberto por outros caminhos. Os query params ficam disponíveis como filtro opcional.

## 6. Ciclo de vida de uma execução

Cada vez que um contexto (o modal) aparece, nasce uma **sessão de preenchimento**:

```
 contexto aparece
       │
       ▼
 [aguardar estabilizar]  campos renderizados, settleMs sem mutações
       │
       ▼
 [snapshot]  para cada campo: localizar → ler valor atual → é padrão?
       │
       ├── mode = off     → só registra
       ├── mode = button  → mostra botão flutuante, espera o clique
       └── mode = auto    → segue
       │
       ▼
 [preencher]  só os campos elegíveis (padrão, ou overwrite=always)
       │      adapter.write → adapter.verify
       ▼
 [marcar]  campo preenchido na sessão → nunca mais nesta sessão
       │
       ▼
 [relatório]  toast: "2 preenchidos · 0 ignorados · 0 não encontrados"
       │
 contexto some (removido do DOM ou perdeu .is-active)
       │
       ▼
 sessão encerrada → próxima aparição = sessão nova
```

Pontos importantes:
- **"Padrão" é avaliado no snapshot**, antes de qualquer preenchimento. Se o modal abrir com um valor já carregado (por exemplo, uma nota em edição), o campo é ignorado.
- Se o usuário **apagar** um campo que a extensão preencheu, ele continua marcado na sessão e não é tocado. Esse é o comportamento "não re-preencher sozinho".
- Campos que **aparecem depois** (seções que se expandem) são avaliados quando surgem, com as mesmas regras.
- O contexto é rastreado por **referência ao elemento** e por estado (`is-active`), porque alguns sites escondem o modal em vez de removê-lo.

## 7. Adaptadores de campo

### 7.1 Interface

```ts
interface FieldAdapter {
  id: AdapterId;
  detect(root: Element): boolean;            // este adaptador entende este campo?
  read(root: Element): string | null;        // valor atual, legível
  isDefault(root: Element, hint?: string): boolean;
  write(root: Element, value: string): Promise<void>;
  verify(root: Element, value: string): boolean;
}
```

Com `adapter: "auto"`, o motor testa os adaptadores em ordem de especificidade e usa o primeiro cujo `detect` aceitar.

### 7.2 Adaptadores iniciais

| Adaptador | Detecta | Escreve como |
|---|---|---|
| `native-text` | `input[type=text/number/email/tel]`, `textarea` | setter nativo de `value` + eventos `input` e `change` (necessário para Vue e React perceberem) |
| `native-select` | `<select>` | escolhe a opção por texto ou valor + `change` |
| `native-choice` | radio e checkbox | `click()` na opção cujo rótulo bate |
| `vue-multiselect` | `.multiselect[role=combobox]` | abre o dropdown (`mousedown`/`focus`), clica no `li[role=option]` cujo texto bate, confere `.multiselect__single` |
| `date` | inputs de data (nativos e mascarados) | depois. Formato vindo da expressão |

Para os portais de energia e água, novos adaptadores entram nesta lista sem mudar o motor.

### 7.3 Regras de "valor padrão"

- `native-text`: vazio, ou igual a `defaultValue` se a regra definir.
- `native-select` / `vue-multiselect`: nenhuma opção selecionada (placeholder visível), ou igual a `defaultValue`.
- `native-choice`: nenhuma opção marcada.

## 8. Localização de campos (Locator)

Identificar campos **pelo rótulo visível** é a estratégia principal: é o que o usuário enxerga e o que muda menos.

Algoritmo do `by: "label"`:
1. Dentro do contêiner do gatilho (ou da página), achar `label` / `legend` / `[aria-label]` cujo texto normalizado (sem `*`, espaços e acentos) bate.
2. Resolver o controle: `label[for]` → elemento pelo id; senão `aria-labelledby`; senão subir até o "campo" mais próximo (o menor ancestral que contém o rótulo e um controle).
3. Retornar a **raiz do campo**, que é o que o adaptador recebe.

Alternativas: `by: "selector"` (CSS) e `by: "name"`. Nunca guardar IDs gerados dinamicamente: na CE os ids são numéricos e mudam a cada abertura.

## 9. Interface do usuário

### 9.1 Options (editor)

- **Regras**: lista agrupada por site, com liga/desliga, duplicar e excluir.
- **Editor de regra**:
  - *Gatilho*: padrão de URL, seletor e texto do contêiner, com botão "testar na aba atual".
  - *Comportamento*: modo, sobrescrita.
  - *Campos*: tabela (rótulo/localizador · tipo · valor · ativo), com pré-visualização do valor resolvido.
- **Variáveis**: chave, nome e valor (por exemplo, `codigo_energia_unidade_1`).
- **Importar/Exportar** JSON.
- **Histórico**: últimas execuções e falhas (guardado só localmente).

### 9.2 "Capturar campo" (modo seletor)

Pelo popup, o usuário ativa o modo captura e clica num campo da página. A extensão:
1. descobre o rótulo e o tipo (adaptador) do campo;
2. sugere o gatilho (contêiner atual e URL);
3. abre o editor com a regra pré-preenchida, faltando só o valor.

É o que torna a criação de regras viável sem saber CSS.

### 9.3 Na página

- **Toast** discreto com o resultado e o link "ver detalhes".
- **Botão flutuante** no modo "um clique".
- **Destaque** temporário (borda) nos campos preenchidos.
- Tudo dentro de Shadow DOM.

## 10. Valores dinâmicos (expressões)

Sintaxe `{{ fonte | filtro | filtro }}`, avaliada por um **parser próprio**. Nada de `eval`, que o MV3 também proíbe.

### Fontes

| Fonte | Exemplo | Resultado |
|---|---|---|
| Variável | `{{ var.codigo_energia }}` | valor cadastrado |
| URL — query | `{{ url.query.order_uuid }}` | `0a1b2c3d-…` |
| URL — caminho | `{{ url.path }}` | `/vendas/relatorio-de-vendas` |
| Data | `{{ now }}` | data e hora atuais |
| Outro campo | `{{ field("Nome") }}` | valor do campo com aquele rótulo |
| Texto da página | `{{ text(".order-number") }}` | texto do elemento |

### Filtros

`date("DD/MM/YYYY")`, `addDays(n)`, `startOfMonth`, `endOfMonth`, `digits` (só números), `upper`, `lower`, `trim`, `regex("padrão", grupo)`, `default("valor")`.

Exemplos:
- `{{ now | endOfMonth | date("DD/MM/YYYY") }}`
- `{{ field("CPF") | digits }}`

Se a expressão não resolver (fonte vazia, sem `default`), o campo é **pulado e reportado**. Nunca é preenchido com lixo.

## 11. Armazenamento e sincronização

### 11.1 Camadas

| Dado | Onde | Sincroniza? |
|---|---|---|
| Regras, variáveis, preferências | `chrome.storage.sync` | Sim (conta Google) |
| Histórico, estado de sessão, cache | `chrome.storage.local` | Não |

Limites do `storage.sync`: cerca de 100 KB no total, 8 KB por item e 512 itens. Para caber, cada regra fica numa chave própria (`rule:<id>`), mais um índice. Isso dá folga para centenas de regras.

### 11.2 Abstração

```ts
interface ConfigRepository {
  load(): Promise<Config>;
  saveRule(rule: Rule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  saveVariables(vars: Variable[]): Promise<void>;
  onChange(cb: (cfg: Config) => void): Unsubscribe;
}
```

Implementação inicial: `ChromeSyncRepository`. Se um dia for preciso (histórico central, backup versionado, limites estourados), entra um `RemoteRepository` apontando para um **servidor próprio (API + Postgres)**:
- uma **API pequena** na frente do banco, porque a extensão nunca fala direto com o Postgres;
- autenticação por token pessoal guardado em `storage.local`;
- o restante da extensão não muda.

### 11.3 Versionamento

A config tem `schemaVersion`. Ao carregar, uma cadeia de migrações atualiza formatos antigos e o Zod valida. Regras inválidas são isoladas e reportadas, sem derrubar as outras.

## 12. Permissões (manifest)

```json
{
  "permissions": ["storage", "scripting", "activeTab"],
  "optional_host_permissions": ["https://*/*"]
}
```

- A extensão é genérica: **nenhum site vem liberado** e não há `host_permissions` nem content script no manifest.
- Cada site pede permissão **na hora em que a regra é criada** (ou pelo botão "Permitir" da lista); o content script é então registrado dinamicamente (`chrome.scripting.registerContentScripts`) só para os sites com regra e permissão.
- Em um site sem regra, "Capturar campo nesta página" injeta o content script sob demanda, com o `activeTab` concedido no clique do ícone.
- Sites sem regra nem clique do usuário não recebem nenhum script.
- O build de testes (`--mode e2e`) é a única exceção: declara localhost/127.0.0.1 e um site de exemplo no manifest.

## 13. Segurança e privacidade

- A extensão **nunca clica** em botões de envio, emissão ou confirmação.
- Regras não devem guardar senhas. Login nos portais continua sendo do usuário (ou do gerenciador de senhas).
- CAPTCHAs dos portais **não** são tratados.
- Nenhuma telemetria. Logs ficam só no `storage.local`.
- Valores de variáveis sincronizam pela conta Google. Dado sensível não deve virar variável.

## 14. Estrutura de pastas (proposta)

```
assistente-preenchimento/
├─ docs/
│  └─ arquitetura.md
├─ src/
│  ├─ entrypoints/
│  │  ├─ background.ts            # service worker
│  │  ├─ content/                 # motor (content script)
│  │  │  ├─ index.ts
│  │  │  ├─ watcher.ts
│  │  │  ├─ matcher.ts
│  │  │  ├─ runner.ts
│  │  │  └─ page-ui/              # toast, botão flutuante, picker
│  │  ├─ popup/                   # Vue
│  │  └─ options/                 # Vue (editor de regras)
│  ├─ core/
│  │  ├─ model/                   # tipos + schemas Zod + migrações
│  │  ├─ locator/
│  │  ├─ adapters/                # native-text, native-select, vue-multiselect…
│  │  ├─ expressions/             # parser + fontes + filtros
│  │  └─ storage/                 # ConfigRepository + implementações
│  └─ shared/                     # mensagens entre contextos, utils
├─ tests/
│  ├─ fixtures/                   # HTML salvo dos sites (ex: ce-nfse-modal.html)
│  ├─ unit/
│  └─ e2e/
├─ presets/                       # regras prontas (ex: ce-nfse.json)
└─ wxt.config.ts
```

`core/` não depende do Chrome, é TypeScript puro e fácil de testar. `entrypoints/` faz a ponte com as APIs da extensão.

## 15. Roadmap em fases

| Fase | Entrega | Resultado para você |
|---|---|---|
| **1 — Motor** | Watcher, Matcher, Runner, Locator por rótulo, adaptadores `native-text` e `vue-multiselect`, regra da NFS-e como *preset* JSON, toast | A NFS-e já preenche sozinha |
| **2 — Configuração** | Options (editor de regras e campos), popup com status, `storage.sync`, importar/exportar | Você edita tudo sem código, em todos os dispositivos |
| **3 — Dinâmico** | Parser de expressões, variáveis, pré-visualização | Valores calculados |
| **4 — Outros sites** | "Capturar campo", permissões sob demanda, `native-select`/`native-choice`, regras para energia e água | Extensão genérica |
| **5 — Opcional** | `RemoteRepository` no servidor próprio, histórico central | Só se o `storage.sync` não bastar |

## 16. Decisões em aberto

1. **UI em Vue 3?** Recomendado. Trocar para React ou Svelte não muda a arquitetura.
2. **Nome da extensão.** "Assistente de Preenchimento": a extensão não é específica de nenhum site.
3. **Fixtures**: salvar o HTML do modal da NFS-e com dados de teste fictícios (sem dados reais de clientes).
4. **Botão "desfazer"** no toast: restaura os valores do snapshot. Barato de fazer, vale incluir na fase 1 ou 2?

---

## Apêndice A — Achados no modal de NFS-e da CE (2026-11-13)

Inspeção feita só com leitura, sem preencher nada.

- Aplicação em **Vue 2**, biblioteca de componentes própria com prefixo `eui-`.
- Modal: `div.modal.eui-modal-wrapper.is-large.is-active`, título "Emitir Nota Fiscal de Serviços Eletrônica". Só um wrapper de modal no DOM enquanto aberto.
- Padrão de campo: `div.eui-field.eui-<tipo>-field` > `label.eui-label` + `div.eui-control` > controle.
- **IDs numéricos dinâmicos** (`for="449"`) → não usar como localizador.
- Tipos de campo no modal: `input-text`, `input-number`, `input-date`, `input-select`, `input-document`, `input-phone`, `input-email`, `input-switch`, `input-toggle`, `input-suffix-options`. São 37 campos rotulados.
- **Código NBS**: `input.eui-input.eui-input-text[type=text]`, placeholder "Digite", `data-cy="default-input-text"`, vazio ao abrir → adaptador `native-text`.
- **Operação de uso ou consumo pessoal**: componente `eui-input-select` baseado em **vue-multiselect** (`div.multiselect[role=combobox]`, opções em `li.multiselect__element[role=option]`), sem `<select>` nativo. Opções: `Não` (id 0) e `Sim` (id 1). Ao abrir mostra o placeholder "Selecione" (`.multiselect__placeholder`). O valor escolhido aparece em `.multiselect__single` → adaptador `vue-multiselect`.
