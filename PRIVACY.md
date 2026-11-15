# Política de Privacidade — Assistente de Preenchimento

Última atualização: 15 de novembro de 2026.

**English summary.** Assistente de Preenchimento does not collect, transmit, sell or share any
personal data. Your rules, variables and preferences stay in your browser (`chrome.storage.local`)
and in `chrome.storage.sync`, which Chrome syncs through your own Google account. The extension has
no servers, no analytics, no tracking and loads no remote code. Site access is requested per site
and only used to fill the fields your own rules describe. Questions: open an issue at
<https://github.com/medeiroz/assistente-preenchimento/issues>.

## Português

### O que a extensão faz

O Assistente de Preenchimento preenche automaticamente campos de formulários nos sites que você
escolher, a partir de regras que você mesmo cria. Tudo acontece dentro do seu navegador.

### Dados que NÃO são coletados

- Não coletamos, não transmitimos, não vendemos e não compartilhamos dados pessoais ou de navegação.
- Não há servidor da extensão: ela não envia nada para a internet.
- Não há análise de uso (analytics), rastreamento, publicidade nem identificadores de usuário.
- Não há código remoto: todo o código está no pacote instalado.

### O que fica guardado e onde

| Dado                                                                                                                           | Onde                   | Observação                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Regras, variáveis e preferências (ex.: sites pausados)                                                                         | `chrome.storage.sync`  | O Chrome pode sincronizar esses dados entre seus dispositivos pela **sua conta Google**, conforme a política do Google. Nós não temos acesso. |
| Histórico dos últimos preenchimentos (nome da regra, endereço da página, campos, valor anterior e valor preenchido, resultado) | `chrome.storage.local` | Fica só neste computador, nunca sincroniza, e pode ser apagado na aba Histórico.                                                              |
| Rascunho temporário de um campo capturado                                                                                      | `chrome.storage.local` | Removido assim que a página de Configurações o usa.                                                                                           |
| Valores das variáveis marcadas "Só neste navegador"                                                                            | `chrome.storage.local` | Ficam só neste navegador, nunca sincronizam e só entram na exportação se você marcar a opção.                                                 |

Os valores que você digita nas regras e nas variáveis ficam armazenados como você os escreveu, sem
criptografia. Regras e variáveis "Sincronizar" sincronizam pela sua conta Google; para dados
sensíveis, use variáveis "Só neste navegador". **Não guarde senhas** em regras.

### Permissões e para que servem

- **storage**: guardar suas regras, variáveis, preferências e o histórico local.
- **scripting**: registrar e executar, nas páginas permitidas, o script que preenche os campos.
- **activeTab**: ao clicar no ícone da extensão em uma página, permitir "Capturar campo nesta
  página" nela, sem acesso permanente.
- **Acesso a sites (`https://*/*` e `http://*/*`, opcional)**: não vem ativado. O Chrome pergunta, site por site,
  quando você salva uma regra ou clica em **Permitir**. Sem sua permissão, a extensão não lê nem altera
  o site. Você pode revogar em `chrome://extensions` › Detalhes.

O acesso é usado somente para localizar os campos descritos nas suas regras, preenchê-los e exibir o
aviso do resultado. O conteúdo da página não é lido para outra finalidade, nem guardado, nem enviado.

### Seus controles

- Exportar, importar, editar e excluir suas regras e variáveis nas Configurações.
- Pausar a extensão por site pelo popup.
- Apagar o histórico na aba Histórico.
- Remover a extensão apaga os dados locais; os dados do `chrome.storage.sync` seguem as regras do
  seu navegador e da sua conta Google.

### Crianças

A extensão não é direcionada a crianças e não coleta dados de ninguém.

### Mudanças nesta política

Mudanças serão publicadas neste arquivo, com a data de atualização no topo.

### Contato

Dúvidas ou solicitações: abra uma _issue_ em
<https://github.com/medeiroz/assistente-preenchimento/issues>.
