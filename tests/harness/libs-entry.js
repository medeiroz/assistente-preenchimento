// Harness de bibliotecas: React-Select (React 19) e Select2 (jQuery 3). Dados fictícios.
// Empacotado por tests/e2e/libs-bundle.ts; não faz parte da extensão.
import $ from 'jquery';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import Select from 'react-select';
import registerSelect2 from 'select2';

window.jQuery = window.$ = $;
registerSelect2(window, $);

const params = new URLSearchParams(location.search);
const preload = params.get('initial') === '1';

const log = { reactChanges: [], select2Changes: [], editableInputs: [], editableBeforeInputs: [] };
window.__libs = log;

// contenteditable
const editable = document.getElementById('nota');
if (preload) editable.textContent = 'Texto anterior';
editable.addEventListener('beforeinput', (e) => log.editableBeforeInputs.push(e.inputType));
editable.addEventListener('input', (e) => log.editableInputs.push(e.inputType));

// React-Select
const options = ['Consulta', 'Retorno', 'Exame'].map((label) => ({
  value: label.toLowerCase(),
  label,
}));
function App() {
  return createElement(Select, {
    inputId: 'tipo-atendimento',
    options,
    isClearable: true,
    placeholder: 'Selecione',
    defaultValue: preload ? options[1] : null,
    onChange: (opt) => log.reactChanges.push(opt ? opt.label : null),
  });
}
createRoot(document.getElementById('react-root')).render(createElement(App));

// Select2
const $s2 = $('#pagamento');
if (preload) $s2.val('cartao');
$s2.select2({ placeholder: 'Selecione', allowClear: true, width: '100%' });
$s2.on('change', function () {
  log.select2Changes.push($(this).val());
});
