# Listagem na Chrome Web Store (pt-BR)

## Nome

Assistente de Preenchimento

## Descrição curta (máx. 132 caracteres)

Preenche campos de formulários automaticamente nos sites que você escolher, com regras que você mesmo cria.

(108 caracteres. É o mesmo texto do campo `description` do manifest.)

## Descrição detalhada

Cansado de digitar sempre os mesmos dados nos mesmos formulários? O Assistente de Preenchimento preenche os campos por você, nos sites que você escolher, a partir de regras que você mesmo cria. Sem programar.

O QUE FAZ
• Preenche campos de formulários (texto, listas, opções, datas e listas com busca) conforme suas regras.
• Funciona sozinho quando o formulário aparece ou com um clique, em um botão na própria página.
• Mostra um aviso com o que foi preenchido, pulado ou não encontrado, e permite desfazer.
• Aceita valores dinâmicos: variáveis suas, parâmetros do endereço da página, datas calculadas e o valor de outros campos.

COMO FUNCIONA

1. Abra o site e clique no ícone da extensão.
2. Use "Capturar campo nesta página" e clique no campo que deseja preencher, ou crie a regra nas Configurações.
3. Defina o valor. Pode ser um texto fixo ou uma expressão como {{ var.cidade }} ou {{ now | date("DD/MM/YYYY") }}.
4. Pronto: nas próximas visitas, a regra preenche sozinha (ou ao clique, como você preferir).

A extensão já vem sem nenhuma regra e sem acesso a nenhum site. Quando você salva uma regra para um site, o Chrome pede a sua permissão para aquele site. Você pode exportar, importar e adicionar regras de arquivos, e pausar a extensão em qualquer site.

PRIVACIDADE
• Não coleta, não envia e não vende nenhum dado. Não há servidor, análise de uso nem anúncios.
• Suas regras ficam no navegador e, se você usa a sincronização do Chrome, na sua própria conta Google (chrome.storage.sync).
• O acesso a um site só existe depois que você permite, e é usado apenas para preencher os campos das suas regras.
• Código aberto (licença MIT): github.com/medeiroz/assistente-preenchimento

LIMITAÇÕES
• Não envia formulários: a extensão nunca clica em botões de enviar, emitir ou confirmar.
• Não resolve CAPTCHA e não faz login por você.
• Não guarde senhas em variáveis ou regras: elas são sincronizadas pela sua conta Google.
• Funciona apenas em sites https. Páginas internas do Chrome e a Chrome Web Store não permitem extensões.
• Alguns sites com formulários muito personalizados podem exigir um seletor CSS na regra.

Dúvidas e sugestões: github.com/medeiroz/assistente-preenchimento/issues

## Categoria sugerida

Produtividade (alternativa: Ferramentas)

## Idioma

Português (Brasil), pt-BR

## Links

- Política de privacidade: https://github.com/medeiroz/assistente-preenchimento/blob/main/PRIVACY.md
- Página inicial / código-fonte: https://github.com/medeiroz/assistente-preenchimento
- Suporte: https://github.com/medeiroz/assistente-preenchimento/issues

## Imagens

- Ícone 128x128: `public/icon/128.png`
- Capturas 1280x800: `store/screenshots/`
- Promo tile pequeno 440x280: `store/promo-440x280.png`
