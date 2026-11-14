# Respostas para a aba "Práticas de privacidade" da Chrome Web Store

Os campos da loja estão em inglês; as respostas abaixo estão em português e podem ser coladas em
português (ou traduzidas, se preferir).

## Finalidade única (Single purpose)

Preencher automaticamente campos de formulários em sites escolhidos pelo usuário, a partir de regras
que ele mesmo cria.

## Justificativa de cada permissão

**storage**
Guarda as regras, variáveis e preferências do usuário (em `chrome.storage.sync`, na conta Google
dele) e o histórico local dos preenchimentos (em `chrome.storage.local`). Sem isso a extensão não
lembraria das regras.

**scripting**
Registra e executa, apenas nas páginas em que o usuário permitiu o acesso, o script que localiza os
campos descritos nas regras e os preenche (`chrome.scripting.registerContentScripts` e
`chrome.scripting.executeScript`).

**activeTab**
Quando o usuário clica no ícone da extensão em uma página sem regra, permite executar "Capturar
campo nesta página" nessa aba, sem pedir acesso permanente ao site.

**Permissões de host opcionais (`optional_host_permissions`: `https://*/*`)**
A extensão não tem acesso fixo a nenhum site. Quando o usuário salva uma regra para um site (ou
clica em "Permitir"), a extensão pede ao Chrome, pelo diálogo nativo, permissão somente para aquele
site. Como o usuário pode criar regras para qualquer site https, o padrão `https://*/*` precisa
constar como opcional; nada é concedido sem o consentimento dele, site por site. Padrões amplos
demais (host `*`) são recusados pela própria extensão.

**Código remoto**
Não. A extensão não carrega nem executa código hospedado fora do pacote: sem `eval`, sem scripts
externos, sem WebAssembly remoto. As expressões das regras são interpretadas por um parser próprio.

## Uso de dados (Data usage)

Tipos de dados coletados: **nenhum**. Deixe todas as caixas de "dados coletados" desmarcadas
(informações pessoais identificáveis, saúde, financeiras, autenticação, comunicações pessoais,
localização, histórico da web, atividade do usuário, conteúdo do site).

Observação para o revisor: a extensão lê os campos da página apenas dentro do navegador, para
preenchê-los conforme as regras do usuário. Nada é transmitido, armazenado fora do navegador ou
compartilhado. As regras ficam no `chrome.storage.sync` da própria conta do usuário.

## Certificações (marque as três)

- Não vendo nem transfiro dados de usuário a terceiros, fora dos casos de uso aprovados.
- Não uso nem transfiro dados de usuário para finalidades alheias à finalidade única do item.
- Não uso nem transfiro dados de usuário para determinar a capacidade de crédito nem para fins de
  empréstimo.

## URL da política de privacidade

https://github.com/medeiroz/assistente-preenchimento/blob/main/PRIVACY.md

## Outros campos

- Site oficial / página inicial: https://github.com/medeiroz/assistente-preenchimento
- URL de suporte: https://github.com/medeiroz/assistente-preenchimento/issues
- Anúncios: a extensão não exibe anúncios.
