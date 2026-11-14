# Assistente de Preenchimento

[![CI](https://github.com/medeiroz/assistente-preenchimento/actions/workflows/ci.yml/badge.svg)](https://github.com/medeiroz/assistente-preenchimento/actions/workflows/ci.yml)

> **English summary.** A Chrome (Manifest V3) extension that fills in form fields automatically on
> the sites you choose, using rules you create yourself. No rule or site is built in: you pick the
> site, the extension asks Chrome for access to that site only, and nothing leaves your browser.
> Rules live in `chrome.storage.sync` (your own Google account). No analytics, no remote code, no
> data sold or shared. Licensed under MIT. See [PRIVACY.md](PRIVACY.md).

Extensão do Chrome que preenche campos de formulários automaticamente, nos sites que você escolher,
a partir de regras que você mesmo cria, sem programar.

## Recursos

- **Regras por site**: cada regra diz em quais páginas atua, quais campos preencher e com quais valores.
- **Preenchimento automático ou com um clique**: a regra pode agir sozinha quando o formulário aparece
  ou mostrar um botão na página.
- **Valores dinâmicos** com expressões `{{ ... }}`: variáveis suas, parâmetros da URL, datas, outros
  campos.
- **Capturar campo**: clique em um campo da página e a regra é montada para você.
- **Desfazer** o último preenchimento, relatório do que foi preenchido, pulado ou não encontrado.
- **Variáveis** reutilizáveis e **histórico** de execuções.
- **Importar/Exportar** a configuração e **adicionar regras de um arquivo** sem apagar as que você já tem.
- **Permissão sob demanda**: a extensão só acessa um site depois que você permite.
- **Não envia formulários**, não resolve CAPTCHA e não clica em botões de confirmação.

## Instalação

### Chrome Web Store

Link: _a preencher após a publicação_.

### Modo desenvolvedor

1. `npm install`
2. `npm run build`
3. Abra `chrome://extensions`, ative o **Modo do desenvolvedor**, clique em **Carregar sem
   compactação** e escolha a pasta `.output/chrome-mv3`.

## Como criar regras

A extensão já vem **sem nenhuma regra**. Três caminhos:

1. **Nova regra**: abra as Configurações (clique com o botão direito no ícone › Opções), aba
   **Regras** › **Nova regra**. Informe o endereço do site (ex.: `https://app.meusite.com/*`), os
   campos (pelo rótulo, `name` ou seletor CSS) e os valores. Ao salvar, o Chrome pede permissão para
   aquele site.
2. **Capturar campo**: abra o site, clique no ícone da extensão e em **Capturar campo nesta página**
   (ou **Capturar campo**, se o site já tem regra). Clique no campo desejado e a regra é montada nas
   Configurações.
3. **Importar um exemplo**: em Configurações › **Importar/Exportar** › **Adicionar regras de um
   arquivo**, escolha um arquivo de regra, como [`presets/ce-nfse.json`](presets/ce-nfse.json). O
   estado inicial (sem regras) também oferece **Importar exemplo da Clínica Experts**.

Adicionar regras de um arquivo **nunca apaga** as que você já tem. Se o identificador de uma regra já
existir, ela recebe um novo.

## Expressões `{{ }}`

O valor de um campo pode misturar texto e expressões: `NF-{{ now | date("YYYY") }}-{{ var.pedido }}`.
Formato: `{{ fonte | filtro | filtro }}`. Se uma expressão não resolver (e não houver `default`), o
campo é pulado e reportado, nunca preenchido com lixo.

| Fonte                          | Exemplo                                              | Resultado                         |
| ------------------------------ | ---------------------------------------------------- | --------------------------------- |
| Variável                       | `{{ var.cidade }}`                                   | valor cadastrado na aba Variáveis |
| URL, parâmetro                 | `{{ url.query.pedido }}`                             | valor de `?pedido=...`            |
| URL, caminho / host / endereço | `{{ url.path }}`, `{{ url.host }}`, `{{ url.href }}` | partes da URL                     |
| Data e hora                    | `{{ now }}`                                          | data e hora atuais                |
| Outro campo                    | `{{ field("Nome") }}`                                | valor do campo com aquele rótulo  |
| Texto da página                | `{{ text(".numero") }}`                              | texto do elemento                 |
| Texto literal                  | `{{ "abc" }}`                                        | o próprio texto                   |

| Filtro                            | Exemplo                                     | O que faz                         |
| --------------------------------- | ------------------------------------------- | --------------------------------- |
| `date("DD/MM/YYYY")`              | `{{ now \| date("DD/MM/YYYY") }}`           | formata a data                    |
| `addDays(n)`, `addMonths(n)`      | `{{ now \| addDays(30) }}`                  | soma dias ou meses                |
| `startOfMonth`, `endOfMonth`      | `{{ now \| endOfMonth }}`                   | primeiro e último dia do mês      |
| `upper`, `lower`, `trim`          | `{{ var.nome \| upper }}`                   | caixa alta, baixa, remove espaços |
| `digits`                          | `{{ field("CPF") \| digits }}`              | só os números                     |
| `replace("a","b")`                | `{{ var.x \| replace("-", "") }}`           | troca texto                       |
| `regex("padrão", grupo)`          | `{{ url.path \| regex("/(\\d+)", 1) }}`     | extrai com expressão regular      |
| `slice(i, j)`, `padStart(n, "0")` | `{{ var.n \| padStart(6, "0") }}`           | recorta e completa                |
| `default("valor")`                | `{{ url.query.ref \| default("sem-ref") }}` | valor reserva                     |

## Privacidade

A extensão não coleta, não transmite e não vende dados. Veja a [política de privacidade](PRIVACY.md).
Não guarde senhas em variáveis: elas sincronizam pela sua conta Google.

## Releases

A cada push na `main`, o GitHub Actions roda todos os checks (tipos, lint, testes, Prettier, build
e E2E) e, se tudo passar, gera automaticamente uma nova versão: calcula o número, atualiza
`package.json`, gera o zip, cria a tag `vX.Y.Z` e publica a Release. Pull requests só rodam os checks.

Baixe o `.zip` (e o `.sha256`) na página de
[Releases](https://github.com/medeiroz/assistente-preenchimento/releases). É o mesmo arquivo que
se envia à Chrome Web Store (veja [store/PUBLICAR.md](store/PUBLICAR.md)).

Regra de versão: se a `version` do `package.json` ainda não tem tag, ela é usada como está; se já
tem, a release usa o próximo patch da maior tag existente. Para uma versão minor ou major, edite a
`version` no `package.json` e faça o push.

## Desenvolvimento

Requisitos: Node.js 22.18 ou superior (as ferramentas rodam arquivos `.ts` direto) e npm.

```sh
npm install              # instala e prepara o WXT
npm run dev              # modo desenvolvimento (WXT)
npm run typecheck        # verificação de tipos
npm run lint             # ESLint
npm test                 # testes unitários (Vitest)
npm run e2e              # build de testes + Playwright (rode antes: npx playwright install chromium)
npm run build            # extensão em .output/chrome-mv3
npm run zip              # pacote para a loja em .output/*-chrome.zip
npm run icons            # regenera os ícones e o promo tile (assets/ → public/icon, store/)
npm run screenshots      # regenera as capturas de tela da loja (store/screenshots)
```

O build de testes (`--mode e2e`) inclui localhost/127.0.0.1 e um harness local; ele nunca é
empacotado para a loja.

### Estrutura do projeto

```
src/
  core/            # lógica sem dependência do Chrome (testável)
    adapters/      # como preencher cada tipo de campo
    engine/        # observa a página, aplica as regras
    expressions/   # parser e filtros de {{ }}
    locator/       # localização e captura de campos
    model/         # esquema das regras (Zod), migrações, relatório
    storage/       # chrome.storage.sync/local
  entrypoints/
    background.ts  # service worker: registro dinâmico do content script
    content/       # content script: motor, toast, botão, captura
    popup/         # popup do ícone
    options/       # página de Configurações (Vue 3)
  shared/          # mensagens e permissões
presets/           # regras de exemplo
tests/             # unit (Vitest), e2e (Playwright), harness e fixtures
store/             # textos, capturas e passo a passo da Chrome Web Store
assets/            # ícone (SVG) e fonte do promo tile
docs/              # arquitetura
```

Mais detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).

## Licença

[MIT](LICENSE) © 2026 medeiroz
