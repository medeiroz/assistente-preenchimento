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

## Lembretes

- Regenere ícones e capturas, se mudar o visual: `npm run icons`, `npm run screenshots` e
  `npm run screenshots -- --lang en` (capturas em inglês em `store/screenshots/en`).
- O build de testes (`npm run e2e`) não é publicado; `npm run zip` gera só o build de produção.
