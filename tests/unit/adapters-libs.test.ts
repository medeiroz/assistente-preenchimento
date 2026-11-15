import { beforeEach, describe, expect, it } from 'vitest';
import {
  contentEditableAdapter,
  createDefaultRegistry,
  reactSelectAdapter,
  select2Adapter,
} from '../../src/core/adapters';

function field(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = `<div class="eui-field">${html}</div>`;
  document.body.append(host);
  return host.firstElementChild as Element;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

const EDITABLE = '<div contenteditable="true">  Olá   mundo </div>';

describe('contentEditableAdapter', () => {
  it('detect: um único editável; ignora campos de formulário e editáveis múltiplos', () => {
    expect(contentEditableAdapter.detect(field(EDITABLE))).toBe(true);
    expect(contentEditableAdapter.detect(field('<div contenteditable>x</div>'))).toBe(true);
    expect(contentEditableAdapter.detect(field('<div contenteditable="false">x</div>'))).toBe(
      false,
    );
    expect(contentEditableAdapter.detect(field(`${EDITABLE}${EDITABLE}`))).toBe(false);
    expect(contentEditableAdapter.detect(field(`${EDITABLE}<input>`))).toBe(false);
    expect(contentEditableAdapter.detect(field('<input>'))).toBe(false);
  });

  it('detect: atravessa shadow root aberto', () => {
    const f = field('<div id="host"></div>');
    const shadow = (f.querySelector('#host') as HTMLElement).attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div contenteditable="true"></div>';
    expect(contentEditableAdapter.detect(f)).toBe(true);
  });

  it('read normaliza espaços; isDefault compara com vazio ou defaultValue', () => {
    const f = field(EDITABLE);
    expect(contentEditableAdapter.read(f)).toBe('Olá mundo');
    expect(contentEditableAdapter.isDefault(f)).toBe(false);
    expect(contentEditableAdapter.isDefault(f, 'Olá mundo')).toBe(true);
    expect(contentEditableAdapter.isDefault(field('<div contenteditable="true"></div>'))).toBe(
      true,
    );
  });

  it('write dispara beforeinput e input (insertText), troca o texto e confere', async () => {
    const f = field(EDITABLE);
    const el = f.querySelector('div') as HTMLElement;
    const events: string[] = [];
    el.addEventListener('beforeinput', (e) => {
      const ie = e as InputEvent;
      events.push(`beforeinput:${ie.inputType}:${ie.data}:${ie.cancelable}`);
    });
    el.addEventListener('input', (e) => events.push(`input:${(e as InputEvent).inputType}`));
    await contentEditableAdapter.write(f, 'Novo texto');
    expect(el.textContent).toBe('Novo texto');
    expect(events).toEqual(['beforeinput:insertText:Novo texto:true', 'input:insertText']);
    expect(contentEditableAdapter.verify(f, 'Novo texto')).toBe(true);
    expect(contentEditableAdapter.verify(f, '  Novo   texto ')).toBe(true);
    expect(contentEditableAdapter.verify(f, 'outro')).toBe(false);
  });

  it('beforeinput cancelado: o editor da página assume e o adaptador não mexe no DOM', async () => {
    const f = field(EDITABLE);
    const el = f.querySelector('div') as HTMLElement;
    let inputs = 0;
    el.addEventListener('beforeinput', (e) => e.preventDefault());
    el.addEventListener('input', () => inputs++);
    await contentEditableAdapter.write(f, 'Novo');
    expect(el.textContent).toBe('  Olá   mundo ');
    expect(inputs).toBe(0);
    expect(contentEditableAdapter.verify(f, 'Novo')).toBe(false);
  });

  it('write com digitação simulada insere caractere a caractere', async () => {
    const f = field('<div contenteditable="true">velho</div>');
    const el = f.querySelector('div') as HTMLElement;
    const inserted: string[] = [];
    el.addEventListener('beforeinput', (e) => {
      const ie = e as InputEvent;
      if (ie.inputType === 'insertText') inserted.push(ie.data ?? '');
    });
    const sleeps: number[] = [];
    await contentEditableAdapter.write(f, 'abc', {
      typing: { keyDelayMs: 5 },
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(inserted).toEqual(['a', 'b', 'c']);
    expect(sleeps).toEqual([5, 5, 5]);
    expect(el.textContent).toBe('abc');
    expect(contentEditableAdapter.verify(f, 'abc', { typing: { keyDelayMs: 5 } })).toBe(true);
  });

  it('digitação interrompida por aborted para no meio', async () => {
    const f = field('<div contenteditable="true"></div>');
    let n = 0;
    await contentEditableAdapter.write(f, 'abcd', {
      typing: { keyDelayMs: 0 },
      aborted: () => n++ >= 2,
    });
    expect(contentEditableAdapter.read(f)).toBe('ab');
  });

  it('clear esvazia (beforeinput/input de remoção) e write sem editável lança', async () => {
    const f = field(EDITABLE);
    const types: string[] = [];
    f.querySelector('div')?.addEventListener('input', (e) =>
      types.push((e as InputEvent).inputType),
    );
    await contentEditableAdapter.clear?.(f);
    expect(contentEditableAdapter.read(f)).toBe('');
    expect(types).toEqual(['deleteContentBackward']);
    await expect(contentEditableAdapter.write(field('<p></p>'), 'x')).rejects.toMatchObject({
      code: 'control-not-found',
    });
  });

  it('clear com beforeinput cancelado e texto intacto falha com write-failed', async () => {
    const f = field(EDITABLE);
    f.querySelector('div')?.addEventListener('beforeinput', (e) => e.preventDefault());
    await expect(contentEditableAdapter.clear?.(f)).rejects.toMatchObject({ code: 'write-failed' });
  });
});

const REACT_SELECT = (prefix: boolean) => `
  <div class="${prefix ? 'rs-container' : 'css-b62m3t-container'}">
    <div class="${prefix ? 'rs__control' : 'css-13cymwt-control'}">
      <div class="${prefix ? 'rs__value-container' : 'css-hlgwow'}">
        <div class="${prefix ? 'rs__single-value' : 'css-1dimb5e-singleValue'}">Retorno</div>
        <input id="react-select-3-input" role="combobox" type="text" value="">
      </div>
    </div>
  </div>`;

describe('reactSelectAdapter', () => {
  it('detect: estrutura do v5 com e sem classNamePrefix; não confunde com texto comum', () => {
    expect(reactSelectAdapter.detect(field(REACT_SELECT(false)))).toBe(true);
    expect(reactSelectAdapter.detect(field(REACT_SELECT(true)))).toBe(true);
    expect(reactSelectAdapter.detect(field('<input type="text">'))).toBe(false);
    expect(
      reactSelectAdapter.detect(
        field('<div class="form-control"><input role="combobox" type="text"></div>'),
      ),
    ).toBe(false);
    expect(reactSelectAdapter.detect(field(`${REACT_SELECT(false)}${REACT_SELECT(false)}`))).toBe(
      false,
    );
  });

  it('read devolve o texto do valor exibido ou null', () => {
    expect(reactSelectAdapter.read(field(REACT_SELECT(false)))).toBe('Retorno');
    expect(reactSelectAdapter.read(field(REACT_SELECT(true)))).toBe('Retorno');
    expect(
      reactSelectAdapter.read(
        field(
          '<div class="css-a-container"><div class="css-b-control"><input role="combobox"></div></div>',
        ),
      ),
    ).toBeNull();
  });
});

const SELECT2 = (rendered: string) => `
  <select id="s" class="select2-hidden-accessible" tabindex="-1" aria-hidden="true">
    <option value=""></option><option value="pix">Pix</option><option value="cartao">Cartão</option>
  </select>
  <span class="select2-container"><span class="selection"><span class="select2-selection">
    <span class="select2-selection__rendered">${rendered}</span>
  </span></span></span>`;

describe('select2Adapter', () => {
  it('detect: select com select2-hidden-accessible (raiz contém ou é o container)', () => {
    const f = field(SELECT2('<span class="select2-selection__placeholder">Selecione</span>'));
    expect(select2Adapter.detect(f)).toBe(true);
    expect(select2Adapter.detect(f.querySelector('.select2-container') as Element)).toBe(true);
    expect(select2Adapter.detect(field('<select><option>a</option></select>'))).toBe(false);
    expect(
      select2Adapter.detect(field('<select multiple class="select2-hidden-accessible"></select>')),
    ).toBe(false);
  });

  it('read lê o rótulo exibido, ignorando placeholder e botão de limpar', () => {
    expect(
      select2Adapter.read(
        field(SELECT2('<span class="select2-selection__placeholder">Selecione</span>')),
      ),
    ).toBeNull();
    expect(
      select2Adapter.read(field(SELECT2('<span class="select2-selection__clear">×</span>Pix'))),
    ).toBe('Pix');
  });

  it('write em opção inexistente lança option-not-found sem alterar o select', async () => {
    const f = field(SELECT2('Pix'));
    const select = f.querySelector('select') as HTMLSelectElement;
    select.value = 'pix';
    await expect(select2Adapter.write(f, 'Cheque')).rejects.toMatchObject({
      code: 'option-not-found',
    });
    expect(select.value).toBe('pix');
  });
});

describe('detecção auto (registro padrão)', () => {
  it('cada biblioteca resolve para o próprio adaptador numa mesma página', () => {
    const registry = createDefaultRegistry();
    const id = (html: string) => registry.resolve(field(html), 'auto')?.id ?? null;
    expect(id(EDITABLE)).toBe('contenteditable');
    expect(id(REACT_SELECT(false))).toBe('react-select');
    expect(id(SELECT2('Pix'))).toBe('select2');
    expect(id('<select><option>a</option></select>')).toBe('native-select');
    expect(id('<input type="text">')).toBe('native-text');
    expect(id('<div class="multiselect"><input></div>')).toBe('vue-multiselect');
    expect(id('<input type="date">')).toBe('date');
  });
});
