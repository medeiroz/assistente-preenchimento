# Assistente de Preenchimento

Extensão do Chrome (Manifest V3) que preenche formulários automaticamente a partir de regras
configuráveis. Construída com WXT, TypeScript, Vue 3, Vitest e Playwright.

## Instalação

```sh
npm install
```

## Comandos

- `npm run dev` — modo desenvolvimento (WXT)
- `npm run build` — gera a extensão em `.output/chrome-mv3`
- `npm run typecheck` — verificação de tipos
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm test` — testes unitários (Vitest)
- `npm run e2e` — build + testes end-to-end (Playwright)

Na primeira execução dos testes e2e, rode `npx playwright install chromium`.

## Carregar a extensão no Chrome

1. Rode `npm run build`.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione `.output/chrome-mv3`.
