# Especificação estrutural — modal "Emitir NFS-e" da Clínica Experts (capturado 2026-11-13)

Capturado do DOM real só com leitura. Nenhum dado pessoal aqui: valores de clientes foram omitidos.
Use dados FICTÍCIOS ao reconstruir (ex.: "Maria Exemplo Teste").

## Casca do modal (literal)

```
div.modal.eui-modal-wrapper.is-large.is-active
  div.eui-modal.modal-card
    div.eui-modal-header.modal-card-head
      div.eui-modal-title.modal-card-title
        span.has-text-basic-900.has-text-18-desktop.has-text-13-mobile.has-text-weight-bold.is-trimmed.is-inline  "Emitir Nota Fiscal de Serviços Eletrônica"
    button.eui-modal-close.eui-button.is-medium.is-basic.is-transparent.is-flat.is-icon > span.eui-button-content > i.eui-icon.ei.ei-times
    div.eui-modal-body.modal-card-body
      div.p-20 > div.eui-message.is-warning   (texto de aviso sobre Configurações > Preferências do sistema)
      div.pt-0.eui-section   header "Dados do cliente"  (14 campos)   body > div.columns
      div.eui-section        header "Dados do serviço"  (24 campos)   body > div.columns.is-multiline
      div.eui-section        header "Valor total"       (0 campos)    body > div.columns.is-multiline
      div.eui-section        (sem header, 0 campos)
    div.eui-modal-footer.modal-card-foot.d-flex.is-centered.is-multiline
      button.eui-button.is-medium.is-primary.is-filled.is-flat  "Emitir NFS-e"
```

Cada seção: `div.eui-section > div.eui-section-header (texto) + div.eui-section-body`.
Cada campo fica dentro de uma coluna, ex.: `div.column.is-12.mb-10` (primeiro) / `div.column.is-4` (maioria).

## Padrão de campo de texto (HTML literal do "Código NBS")

```html
<div class="eui-field is-medium is-basic is-fullwidth has-label-at-top eui-input-text-field">
  <label for="449" class="eui-label"
    >Código NBS<i
      class="eui-label-help eui-icon ei ei-question-circle"
      data-tippy-directive=""
      tabindex="0"
    ></i
  ></label>
  <div class="eui-control">
    <input
      id="449"
      type="text"
      placeholder="Digite"
      autocomplete="off"
      data-cy="default-input-text"
      class="eui-input eui-input-text"
    />
  </div>
</div>
```

IDs são numéricos e gerados dinamicamente (mudam a cada abertura). Use ids numéricos sequenciais arbitrários.
`.eui-label-help` só existe nos campos marcados "help" abaixo.

## Padrão vue-multiselect (árvore literal do "Operação de uso ou consumo pessoal", estado vazio)

```
div.eui-field.is-medium.is-basic.is-fullwidth.has-label-at-top.eui-input-select-field
  label.eui-label[for=469]  "Operação de uso ou consumo pessoal" (+ help icon)
  div.eui-control
    div.multiselect.eui-input.eui-input-select.is-clearable.is-color-basic [role=combobox]
      div.multiselect__select
      div.multiselect__clear
      div.multiselect__tags
        div.multiselect__tags-wrap
        div.multiselect__spinner
        span.multiselect__placeholder  "Selecione"
      div.multiselect__content-wrapper
        ul.multiselect__content [role=listbox]
          li.multiselect__element [role=option] > span.multiselect__option.multiselect__option--highlight > div.multiselect__option-desc   "Não"
          li.multiselect__element [role=option] > span.multiselect__option > div.multiselect__option-desc   "Sim"
          li > span.multiselect__option > span  "Nenhuma opção encontrada"   (oculto)
          li > span.multiselect__option ...  (lista vazia, oculto)
```

Com valor selecionado, o placeholder é substituído por `span.multiselect__single` com o texto da opção, e o wrapper ganha a classe `has-value`.
Selects pesquisáveis têm `is-searchable` e um `input.multiselect__input` dentro de `.multiselect__tags`.
O dropdown (`.multiselect__content-wrapper`) fica oculto (display:none) quando fechado.

## Toggle "Tipo de pessoa"

`div.eui-control > div.eui-button-group.is-medium.is-primary.is-grouped.is-fullwidth > div.eui-button-group-wrapper` com dois botões "Física" (ativo) e "Jurídica".

## Lista de campos (ordem real; formato: rótulo | tipo (classe eui-input-<tipo>-field) | posição do label | cor | extras)

Seção "Dados do cliente":

1. Não enviar dados do tomador na emissão da nota | switch | right | is-basic | help | input[checkbox].eui-input-switch data-cy=default-input-switch
2. Tipo de pessoa* | toggle | top | is-primary | botões Física/Jurídica
3. Nome* | select | top | is-basic | multiselect is-fixed is-searchable has-value (valor: nome fictício)
4. CPF* | document | top | is-basic | input[tel].eui-input.eui-input-document placeholder=000.000.000-00
5. Telefone* | phone | top | is-basic | input[tel].eui-input.eui-input-phone placeholder="(99) 99999-9999" + multiselect de país (is-fixed is-searchable has-value, valor "+55") — campo sem label próprio para o seletor de país
6. E-mail* | email | top | is-basic | input[email].eui-input.eui-input-email placeholder=Digite
7. Código postal* | text | top | is-basic | input[text] placeholder=00000-000 data-cy=default-input-text
8. Estado* | select | top | is-basic | multiselect is-searchable has-value (27 opções no real; use 3 fictícias)
9. Cidade* | select | top | is-basic | multiselect is-searchable has-value (650 no real; use 3 fictícias)
10. Bairro* | text | top | is-basic | placeholder=Digite
11. Rua* | text | top | is-basic | placeholder=Digite
12. Número* | text | top | is-basic | placeholder=Digite
13. Complemento | text | top | is-basic | placeholder=Digite

Seção "Dados do serviço": 14. Descrição* | text | top | is-basic 15. Data de competência | date | top | is-basic | help | input[text].eui-input.eui-input-datepicker data-cy=default-input-date 16. Código tributário municipal | text | help 17. Código de tributação municipal do ISSQN | text 18. Código de tributação nacional do ISSQN | text 19. ISS | number | input[tel].v-money.eui-input.eui-input-number placeholder="0,00%" data-cy=default-input-number 20. Código NBS | text | help ← ALVO 21. Código da Situação Tributária do IBS/CBS | text 22. Código de Classificação Tributária do IBS/CBS | text 23. Código indicador da operação | text | help 24. Operação de uso ou consumo pessoal | select | help | multiselect is-clearable, sem busca, placeholder "Selecione", opções Não/Sim ← ALVO 25. Tipo de operação governamental | select | multiselect is-clearable, sem busca, placeholder "Selecione", opções:
"1 - Fornecimento com pagamento posterior" / "2 - Recebimento do pagamento com fornecimento já realizado" / "3 - Fornecimento com pagamento já realizado" / "4 - Recebimento do pagamento com fornecimento posterior" / "5 - Fornecimento e recebimento do pagamento concomitantes" 26. Alíquota da UF para IBS | number | help | input[tel].v-money placeholder="0,00%" 27. Alíquota do Município para IBS | number | help | input[tel].v-money placeholder="0,00%" 28. Alíquota da União para CBS | number | input[tel].v-money placeholder="0,00%" 29. Alíq. do serviço prestado relativo ao município | number | input[number] placeholder="0,00%" 30. Código interno do contribuinte | text 31. Informações adicionais | text | help 32. Alíq. aproximada dos tributos municipais (%) | number | input[tel] placeholder=Digite 33. Alíq. aproximada dos tributos estaduais (%) | number | input[tel] placeholder=Digite 34. Alíq. aproximada dos tributos federais (%) | number | input[tel] placeholder=Digite 35. Valor aproximado dos tributos municipais (R$) | number | input[tel] placeholder=Digite 36. Valor aproximado dos tributos estaduais (R$) | number | input[tel] placeholder=Digite 37. Valor aproximado dos tributos federais (R$) | number | input[tel] placeholder=Digite

Campos de texto sem extra: input[text].eui-input.eui-input-text placeholder=Digite data-cy=default-input-text, todos com is-basic e has-label-at-top.
Estado ao abrir: campos de serviço vazios; os dois ALVOS vazios (NBS sem valor; consumo pessoal mostra placeholder "Selecione").
