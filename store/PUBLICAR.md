# Como publicar nas lojas (Chrome, Edge e Firefox)

Passo a passo para o dono do projeto.

## 1. Conta de desenvolvedor

1. Acesse o [Painel do desenvolvedor da Chrome Web Store](https://chrome.google.com/webstore/devconsole)
   com a conta Google que será a dona da extensão.
2. Aceite o contrato e pague a taxa única de registro (US$ 5).
3. Ative a verificação em duas etapas na conta, se ainda não estiver ativa (a loja exige).
4. Informe o e-mail de contato do desenvolvedor e verifique-o. Ele fica visível na página da loja.

## 2. Gerar o pacote

Na raiz do repositório, com a versão desejada em `package.json`:

```sh
npm ci
npm run zip
```

O arquivo sai em `.output/assistente-preenchimento-<versão>-chrome.zip`. Confira o conteúdo
(`unzip -l .output/*-chrome.zip`): deve ter só `manifest.json`, `background.js`, `popup.html`,
`options.html`, `content-scripts/`, `chunks/`, `assets/`, `icon/` e `_locales/`.

## 3. Criar o item

1. No painel, clique em **Novo item** e envie o `.zip`.
2. Em **Listagem na loja**, preencha com os textos de [`listing-pt-BR.md`](listing-pt-BR.md):
   nome, descrição curta, descrição detalhada, categoria (Produtividade) e idioma (pt-BR). Acrescente
   o idioma inglês com os textos de [`listing-en.md`](listing-en.md).
3. Envie as imagens:
   - **Ícone da loja**: `public/icon/128.png` (128x128).
   - **Capturas de tela**: os arquivos de `store/screenshots/` (1280x800; mínimo 1, máximo 5).
   - **Promo tile pequeno**: `store/promo-440x280.png` (440x280).
4. Preencha **Site oficial** e **URL de suporte** (veja o fim de `listing-pt-BR.md`).

## 4. Privacidade

Na aba **Práticas de privacidade**:

1. Cole a **finalidade única** e as **justificativas de cada permissão** de
   [`privacy-practices.md`](privacy-practices.md).
2. Responda que **não usa código remoto**.
3. Em dados de usuário, **não marque nenhum tipo** como coletado e marque as três certificações.
4. Cole a URL da política de privacidade:
   `https://github.com/medeiroz/assistente-preenchimento/blob/main/PRIVACY.md`
   (o arquivo precisa estar publicado na branch `main` do repositório público).

## 5. Distribuição e envio

1. Na aba **Distribuição**, escolha a visibilidade:
   - **Pública**: aparece na busca da loja.
   - **Não listada**: só quem tem o link instala (bom para um primeiro teste).
2. Escolha os países (todos, por padrão) e deixe como gratuito.
3. Clique em **Enviar para revisão**. A primeira revisão costuma levar de alguns dias a algumas
   semanas, sobretudo por causa das permissões de host. A justificativa em `privacy-practices.md`
   existe para agilizar isso.
4. Quando for aprovada, copie o link da loja e coloque-o no `README.md` (seção Instalação).

## 6. Novas versões

1. Faça o push na `main`: o GitHub Actions gera sozinho uma nova Release (patch automático).
   Para uma versão minor ou major, edite `version` em `package.json` antes do push.
2. Baixe o `.zip` da última [Release](https://github.com/medeiroz/assistente-preenchimento/releases)
   (é o mesmo pacote que `npm run zip` geraria, já verificado pelo CI). A loja exige versão maior
   que a publicada.
3. No painel, abra o item, **Pacote** › **Fazer upload da nova versão** e envie para revisão.

Com os secrets da seção 9 configurados, os passos 2 e 3 são feitos pelo CI, nas três lojas.

## 7. Microsoft Edge Add-ons

1. Crie a conta no [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge) (gratuito).
2. **Criar nova extensão** e envie o mesmo `-chrome.zip` da Release.
3. Use os mesmos textos, imagens, justificativas de permissão e política de privacidade.

## 8. Firefox (addons.mozilla.org)

1. Crie a conta no [Developer Hub](https://addons.mozilla.org/developers/).
2. Confirme o `gecko.id` em `wxt.config.ts` (`assistente-preenchimento@medeiroz.github.io`): ele não
   muda depois da primeira assinatura.
3. Gere os pacotes (ou baixe-os da Release): `npm run zip:firefox` cria
   `.output/*-firefox.zip` e `.output/*-sources.zip`. Antes, `npm run build:firefox` e
   `npm run lint:firefox` devem passar sem erros.
4. **Enviar novo complemento** › "Neste site" e envie o `-firefox.zip`. Quando a AMO pedir o
   código-fonte, envie o `-sources.zip` com a instrução: `npm ci && npm run build:firefox`
   (Node 22.18 ou superior). Os 4 avisos do `web-ext lint` vêm de bibliotecas (detecção de `eval`
   do Zod e `innerHTML` do runtime do Vue) e não executam código remoto.
5. Em coleta de dados, a extensão declara `data_collection_permissions: none`.
6. Versão mínima: Firefox 140 (desktop) e 142 (Android).
7. Antes do primeiro envio, teste à mão no Firefox: carregar em `about:debugging`, conceder um
   site, reiniciar o navegador e conferir o preenchimento, revogar a permissão, menu de contexto,
   iframes e a gravação.

## 9. Publicação automática pelo CI

Depois de cada Release, o job **Publicar nas lojas** (`.github/workflows/ci.yml`) envia a nova
versão para revisão em cada loja configurada. Uma loja sem todos os secrets é pulada, então dá para
ligar uma de cada vez. O primeiro envio de cada loja continua manual (seções 3 a 8); a revisão das
lojas continua existindo.

Os secrets ficam no GitHub, em **Settings › Secrets and variables › Actions › New repository
secret**. Nunca os coloque em arquivos do repositório.

### Chrome Web Store (API v2, conta de serviço)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um
   existente) e ative a **Chrome Web Store API** em **APIs e serviços › Biblioteca**.
2. Em **IAM e administrador › Contas de serviço**, crie uma conta de serviço. Na conta criada,
   **Chaves › Adicionar chave › Criar nova chave › JSON**. Guarde o arquivo baixado em lugar seguro.
3. No [painel da Chrome Web Store](https://chrome.google.com/webstore/devconsole), em **Conta**,
   adicione o e-mail da conta de serviço (campo `client_email` do JSON) como conta de serviço e
   copie o **ID do editor** (Publisher ID).
4. Crie os secrets:

| Secret                                | Valor                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `CHROME_EXTENSION_ID`                 | ID do item (32 letras, aparece na URL do item no painel)               |
| `CHROME_PUBLISHER_ID`                 | ID do editor, da página **Conta**                                      |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | `client_email` do JSON                                                 |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`  | `private_key` do JSON, inteira, de `-----BEGIN` até `PRIVATE KEY-----` |

Se uma versão anterior ainda estiver em revisão, a Chrome Web Store recusa o envio novo; espere a
revisão terminar e reexecute o job.

### Microsoft Edge Add-ons

1. No [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge), abra
   **Microsoft Edge › Publish API** e clique em **Create API credentials**.
2. Crie os secrets:

| Secret            | Valor                                              |
| ----------------- | -------------------------------------------------- |
| `EDGE_PRODUCT_ID` | Product ID, na página de visão geral da extensão   |
| `EDGE_CLIENT_ID`  | Client ID mostrado na página Publish API           |
| `EDGE_API_KEY`    | API key gerada (aparece uma vez só; copie na hora) |

A API key expira; a data aparece na página Publish API. Quando expirar, gere outra e atualize o
secret.

### Firefox (AMO)

1. Em [Gerenciar chaves de API](https://addons.mozilla.org/developers/addon/api/key/), gere as
   credenciais.
2. Crie os secrets:

| Secret               | Valor                 |
| -------------------- | --------------------- |
| `FIREFOX_JWT_ISSUER` | JWT issuer (`user:…`) |
| `FIREFOX_JWT_SECRET` | JWT secret            |

O id da extensão vem fixo do workflow (`assistente-preenchimento@medeiroz.github.io`). O envio vai
para o canal público (listed), só para Firefox desktop, com o `-sources.zip` da Release.

### Quando algo falhar

O job aparece em vermelho na aba **Actions**, com a mensagem da loja. A Release já está publicada;
corrija o problema (secret, revisão pendente, versão repetida) e use **Re-run failed jobs**: só o
envio às lojas é refeito.

## Lembretes

- Regenere ícones e capturas, se mudar o visual: `npm run icons`, `npm run screenshots` e
  `npm run screenshots -- --lang en` (capturas em inglês em `store/screenshots/en`).
- O build de testes (`npm run e2e`) não é publicado; `npm run zip` gera só o build de produção.
