import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultRegistry,
  dateAdapter,
  nativeChoiceAdapter,
  nativeSelectAdapter,
  nativeTextAdapter,
  vueMultiselectAdapter,
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

const SELECT = `<select>
  <option value="">Selecione</option>
  <option value="e">Energia   Exemplo</option>
  <option value="l">Luz Teste</option>
</select>`;

describe('nativeSelectAdapter', () => {
  it('detect: um select simples, sem multiple nem multiselect', () => {
    expect(nativeSelectAdapter.detect(field(SELECT))).toBe(true);
    expect(nativeSelectAdapter.detect(field('<select multiple></select>'))).toBe(false);
    expect(nativeSelectAdapter.detect(field(`${SELECT}${SELECT}`))).toBe(false);
    expect(nativeSelectAdapter.detect(field(`<div class="multiselect">${SELECT}</div>`))).toBe(
      false,
    );
    expect(nativeSelectAdapter.detect(field('<input>'))).toBe(false);
  });

  it('read/isDefault: placeholder vazio é null e default', () => {
    const f = field(SELECT);
    expect(nativeSelectAdapter.read(f)).toBeNull();
    expect(nativeSelectAdapter.isDefault(f)).toBe(true);
    expect(nativeSelectAdapter.isDefault(f, 'Luz Teste')).toBe(false);
  });

  it('write por texto normalizado, com input/change, e verify', async () => {
    const f = field(SELECT);
    const select = f.querySelector('select') as HTMLSelectElement;
    const events: string[] = [];
    for (const t of ['input', 'change']) select.addEventListener(t, () => events.push(t));
    await nativeSelectAdapter.write(f, 'Energia Exemplo');
    expect(select.value).toBe('e');
    expect(events).toEqual(['input', 'change']);
    expect(nativeSelectAdapter.read(f)).toBe('Energia Exemplo');
    expect(nativeSelectAdapter.verify(f, 'Energia Exemplo')).toBe(true);
    expect(nativeSelectAdapter.verify(f, 'Luz Teste')).toBe(false);
    expect(nativeSelectAdapter.isDefault(f)).toBe(false);
    expect(nativeSelectAdapter.isDefault(f, 'Energia Exemplo')).toBe(true);
  });

  it('write por value quando o texto não bate', async () => {
    const f = field(SELECT);
    await nativeSelectAdapter.write(f, 'l');
    expect(nativeSelectAdapter.read(f)).toBe('Luz Teste');
  });

  it('opção inexistente lança option-not-found sem efeito colateral', async () => {
    const f = field(SELECT);
    await nativeSelectAdapter.write(f, 'Luz Teste');
    const select = f.querySelector('select') as HTMLSelectElement;
    let events = 0;
    for (const t of ['input', 'change']) select.addEventListener(t, () => events++);
    await expect(nativeSelectAdapter.write(f, 'Nenhuma')).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'option-not-found',
    });
    expect(select.value).toBe('l');
    expect(events).toBe(0);
  });
});

describe('nativeChoiceAdapter', () => {
  const RADIOS = `<label class="eui-label">Tipo de conta</label>
    <input type="radio" name="t" id="r1" value="res"><label for="r1">Residencial</label>
    <label><input type="radio" name="t" value="com"> Comercial</label>
    <input type="radio" name="t" value="ind" aria-label="Industrial">`;

  it('radios: detect, read, isDefault, write e verify', async () => {
    const f = field(RADIOS);
    expect(nativeChoiceAdapter.detect(f)).toBe(true);
    expect(nativeChoiceAdapter.read(f)).toBeNull();
    expect(nativeChoiceAdapter.isDefault(f)).toBe(true);
    await nativeChoiceAdapter.write(f, 'Comercial');
    expect(nativeChoiceAdapter.read(f)).toBe('Comercial');
    expect(nativeChoiceAdapter.isDefault(f)).toBe(false);
    expect(nativeChoiceAdapter.isDefault(f, 'Comercial')).toBe(true);
    await nativeChoiceAdapter.write(f, 'Industrial');
    expect(nativeChoiceAdapter.read(f)).toBe('Industrial');
    await nativeChoiceAdapter.write(f, 'res'); // por value
    expect(nativeChoiceAdapter.read(f)).toBe('Residencial');
    expect(nativeChoiceAdapter.verify(f, 'Residencial')).toBe(true);
    expect(nativeChoiceAdapter.verify(f, 'Comercial')).toBe(false);
  });

  it('radios: opção inexistente não altera nada; names distintos não formam grupo', async () => {
    const f = field(RADIOS);
    await nativeChoiceAdapter.write(f, 'Comercial');
    await expect(nativeChoiceAdapter.write(f, 'Rural')).rejects.toMatchObject({
      code: 'option-not-found',
    });
    expect(nativeChoiceAdapter.read(f)).toBe('Comercial');
    expect(
      nativeChoiceAdapter.detect(
        field('<input type="radio" name="a"><input type="radio" name="b">'),
      ),
    ).toBe(false);
  });

  it('checkbox: Sim/Não, valores aceitos e click só quando muda', async () => {
    const f = field('<input type="checkbox">');
    const box = f.querySelector('input') as HTMLInputElement;
    let clicks = 0;
    box.addEventListener('click', () => clicks++);
    expect(nativeChoiceAdapter.detect(f)).toBe(true);
    expect(nativeChoiceAdapter.read(f)).toBe('Não');
    expect(nativeChoiceAdapter.isDefault(f)).toBe(true);
    for (const v of ['Sim', 'true', '1', 'ON']) {
      await nativeChoiceAdapter.write(f, 'off');
      await nativeChoiceAdapter.write(f, v);
      expect(box.checked).toBe(true);
      expect(nativeChoiceAdapter.verify(f, v)).toBe(true);
    }
    for (const v of ['Não', 'NAO', 'false', '0', 'off']) {
      await nativeChoiceAdapter.write(f, 'sim');
      await nativeChoiceAdapter.write(f, v);
      expect(box.checked).toBe(false);
    }
    clicks = 0;
    await nativeChoiceAdapter.write(f, 'Não'); // já está desmarcado
    expect(clicks).toBe(0);
    expect(nativeChoiceAdapter.isDefault(f, 'Não')).toBe(true);
    expect(nativeChoiceAdapter.isDefault(f, 'Sim')).toBe(false);
  });

  it('checkbox: valor inválido lança write-failed sem alterar', async () => {
    const f = field('<input type="checkbox">');
    await expect(nativeChoiceAdapter.write(f, 'talvez')).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'write-failed',
    });
    expect(nativeChoiceAdapter.read(f)).toBe('Não');
    expect(nativeChoiceAdapter.verify(f, 'talvez')).toBe(false);
  });

  it('checkbox: dois checkboxes não são detectados', () => {
    expect(
      nativeChoiceAdapter.detect(field('<input type="checkbox"><input type="checkbox">')),
    ).toBe(false);
  });

  const toggle = `<div class="eui-button-group"><div>
    <button type="button" class="eui-button is-filled">Física</button>
    <button type="button" class="eui-button">Jurídica</button>
  </div></div>`;

  it('toggle: read do ativo, write por click, isDefault só com defaultValue', async () => {
    const f = field(toggle);
    const [fisica, juridica] = Array.from(f.querySelectorAll('button')) as [
      HTMLButtonElement,
      HTMLButtonElement,
    ];
    // simula o framework: o click troca a classe ativa
    for (const b of [fisica, juridica]) {
      b.addEventListener('click', () => {
        fisica.classList.toggle('is-filled', b === fisica);
        juridica.classList.toggle('is-filled', b === juridica);
      });
    }
    expect(nativeChoiceAdapter.detect(f)).toBe(true);
    expect(nativeChoiceAdapter.read(f)).toBe('Física');
    expect(nativeChoiceAdapter.isDefault(f)).toBe(false);
    expect(nativeChoiceAdapter.isDefault(f, 'Física')).toBe(true);
    await nativeChoiceAdapter.write(f, 'Jurídica');
    expect(nativeChoiceAdapter.read(f)).toBe('Jurídica');
    expect(nativeChoiceAdapter.verify(f, 'Jurídica')).toBe(true);
    expect(nativeChoiceAdapter.verify(f, 'Física')).toBe(false);
    await expect(nativeChoiceAdapter.write(f, 'Outra')).rejects.toMatchObject({
      code: 'option-not-found',
    });
  });

  it('toggle: reconhece is-active e aria-pressed; botão único não é toggle', () => {
    const a = field(
      '<div class="eui-button-group"><button class="is-active">A</button><button>B</button></div>',
    );
    expect(nativeChoiceAdapter.read(a)).toBe('A');
    const b = field(
      '<div class="eui-button-group"><button>A</button><button aria-pressed="true">B</button></div>',
    );
    expect(nativeChoiceAdapter.read(b)).toBe('B');
    expect(
      nativeChoiceAdapter.detect(field('<div class="eui-button-group"><button>A</button></div>')),
    ).toBe(false);
  });
});

describe('dateAdapter', () => {
  it('detect: type=date, datepicker, placeholder dd/mm/aaaa e data-date-format', () => {
    expect(dateAdapter.detect(field('<input type="date">'))).toBe(true);
    expect(dateAdapter.detect(field('<input class="eui-input-datepicker">'))).toBe(true);
    expect(dateAdapter.detect(field('<input placeholder="DD/MM/AAAA">'))).toBe(true);
    expect(dateAdapter.detect(field('<input data-date-format="dd/mm/yyyy">'))).toBe(true);
    expect(dateAdapter.detect(field('<input placeholder="Digite">'))).toBe(false);
    expect(dateAdapter.detect(field('<p></p>'))).toBe(false);
  });

  it('type=date: escreve ISO, dispara input/change e lê DD/MM/YYYY', async () => {
    const f = field('<input type="date">');
    const input = f.querySelector('input') as HTMLInputElement;
    const events: string[] = [];
    for (const t of ['input', 'change']) input.addEventListener(t, () => events.push(t));
    expect(dateAdapter.read(f)).toBe('');
    expect(dateAdapter.isDefault(f)).toBe(true);
    await dateAdapter.write(f, '05/03/2026');
    expect(input.value).toBe('2026-03-05');
    expect(events).toEqual(['input', 'change']);
    expect(dateAdapter.read(f)).toBe('05/03/2026');
    expect(dateAdapter.verify(f, '2026-03-05')).toBe(true);
    expect(dateAdapter.verify(f, '06/03/2026')).toBe(false);
    expect(dateAdapter.isDefault(f)).toBe(false);
    expect(dateAdapter.isDefault(f, '05/03/2026')).toBe(true);
  });

  it('texto com máscara: escreve DD/MM/YYYY com input/change/blur', async () => {
    const f = field('<input type="text" class="eui-input-datepicker" placeholder="Digite">');
    const input = f.querySelector('input') as HTMLInputElement;
    const events: string[] = [];
    for (const t of ['input', 'change', 'blur']) input.addEventListener(t, () => events.push(t));
    await dateAdapter.write(f, '2026-12-31');
    expect(input.value).toBe('31/12/2026');
    expect(events).toEqual(['input', 'change', 'blur']);
    expect(dateAdapter.verify(f, '31/12/2026')).toBe(true);
  });

  it('read devolve o texto cru quando não parseia', () => {
    expect(dateAdapter.read(field('<input class="eui-input-datepicker" value="ontem">'))).toBe(
      'ontem',
    );
  });

  it('datas inválidas lançam write-failed sem alterar', async () => {
    const f = field('<input type="date">');
    for (const bad of ['31/02/2026', '2026-13-01', '1/1/2026', 'abc', '', '29/02/2025']) {
      await expect(dateAdapter.write(f, bad)).rejects.toMatchObject({
        name: 'AdapterError',
        code: 'write-failed',
      });
    }
    expect(dateAdapter.read(f)).toBe('');
    await dateAdapter.write(f, '29/02/2028'); // bissexto
    expect(dateAdapter.read(f)).toBe('29/02/2028');
  });
});

describe('registry auto com adaptadores extras', () => {
  const registry = createDefaultRegistry();

  it('escolhe o adaptador certo por tipo de controle', () => {
    expect(registry.resolve(field(SELECT), 'auto')).toBe(nativeSelectAdapter);
    expect(registry.resolve(field('<input type="checkbox">'), 'auto')).toBe(nativeChoiceAdapter);
    expect(registry.resolve(field('<input type="date">'), 'auto')).toBe(dateAdapter);
    expect(registry.resolve(field('<input class="eui-input-datepicker">'), 'auto')).toBe(
      dateAdapter,
    );
    expect(registry.resolve(field('<input>'), 'auto')).toBe(nativeTextAdapter);
    expect(nativeTextAdapter.detect(field('<input class="eui-input-datepicker">'))).toBe(false);
  });

  describe('fixture da CE', () => {
    const html = readFileSync(
      resolve(import.meta.dirname, '../fixtures/ce-nfse-modal.html'),
      'utf8',
    );
    const byLabel = (text: string): Element => {
      document.body.innerHTML = html;
      const label = Array.from(document.querySelectorAll('label.eui-label')).find(
        (l) => l.textContent?.replace('*', '').trim() === text,
      );
      const root = label?.closest('.eui-field');
      if (!root) throw new Error(`campo ausente: ${text}`);
      return root;
    };

    it('"Data de competência" resolve para date', () => {
      const root = byLabel('Data de competência');
      expect(registry.resolve(root, 'auto')).toBe(dateAdapter);
      expect(dateAdapter.read(root)).toBe('');
    });

    it('"Tipo de pessoa" resolve para native-choice (toggle)', () => {
      const root = byLabel('Tipo de pessoa');
      expect(registry.resolve(root, 'auto')).toBe(nativeChoiceAdapter);
      expect(nativeChoiceAdapter.read(root)).toBe('Física');
    });

    it('switch "Não enviar dados do tomador" resolve para native-choice (checkbox)', () => {
      const root = byLabel('Não enviar dados do tomador na emissão da nota');
      expect(registry.resolve(root, 'auto')).toBe(nativeChoiceAdapter);
      expect(nativeChoiceAdapter.read(root)).toBe('Não');
    });

    it('campos de texto e multiselect seguem inalterados', () => {
      expect(registry.resolve(byLabel('Código NBS'), 'auto')).toBe(nativeTextAdapter);
      expect(registry.resolve(byLabel('Nome'), 'auto')).toBe(vueMultiselectAdapter);
    });
  });
});

describe('clear() dos adaptadores', () => {
  it('native-text e date: valor vazio com input/change', async () => {
    for (const [adapter, html] of [
      [nativeTextAdapter, '<input value="abc">'],
      [dateAdapter, '<input type="date" value="2026-03-05">'],
      [dateAdapter, '<input class="eui-input-datepicker" value="05/03/2026">'],
    ] as const) {
      const f = field(html);
      const input = f.querySelector('input') as HTMLInputElement;
      const events: string[] = [];
      for (const t of ['input', 'change']) input.addEventListener(t, () => events.push(t));
      await adapter.clear?.(f);
      expect(input.value).toBe('');
      expect(events).toEqual(['input', 'change']);
    }
  });

  it('native-select: escolhe a opção vazia; sem ela, write-failed', async () => {
    const f = field(SELECT);
    await nativeSelectAdapter.write(f, 'Luz Teste');
    const events: string[] = [];
    const select = f.querySelector('select') as HTMLSelectElement;
    for (const t of ['input', 'change']) select.addEventListener(t, () => events.push(t));
    await nativeSelectAdapter.clear?.(f);
    expect(nativeSelectAdapter.read(f)).toBeNull();
    expect(events).toEqual(['input', 'change']);
    const noEmpty = field(
      '<select><option value="a">A</option><option value="b">B</option></select>',
    );
    await expect(nativeSelectAdapter.clear?.(noEmpty)).rejects.toMatchObject({
      code: 'write-failed',
      message: 'não é possível limpar',
    });
  });

  it('native-choice: checkbox desmarca; radio não tem clear útil', async () => {
    const f = field('<input type="checkbox" checked>');
    await nativeChoiceAdapter.clear?.(f);
    expect(nativeChoiceAdapter.read(f)).toBe('Não');
    await nativeChoiceAdapter.clear?.(f); // já desmarcado: no-op
    expect(nativeChoiceAdapter.read(f)).toBe('Não');
    const radios = field(
      '<input type="radio" name="x" id="r1"><label for="r1">A</label><input type="radio" name="x" id="r2"><label for="r2">B</label>',
    );
    await expect(nativeChoiceAdapter.clear?.(radios)).rejects.toMatchObject({
      code: 'write-failed',
    });
  });

  it('vue-multiselect: usa .multiselect__clear (mousedown+click) sem teclado', async () => {
    const f = field(`<div class="multiselect">
      <div class="multiselect__clear">×</div>
      <div class="multiselect__tags"><span class="multiselect__single">Sim</span></div>
    </div>`);
    const clear = f.querySelector('.multiselect__clear') as HTMLElement;
    const events: string[] = [];
    const keys: string[] = [];
    for (const t of ['mousedown', 'click']) clear.addEventListener(t, () => events.push(t));
    document.addEventListener('keydown', (e) => keys.push(e.key));
    clear.addEventListener('mousedown', () => f.querySelector('.multiselect__single')?.remove());
    await vueMultiselectAdapter.clear?.(f);
    expect(events).toEqual(['mousedown', 'click']);
    expect(vueMultiselectAdapter.read(f)).toBeNull();
    expect(keys).toEqual([]);
  });

  it('vue-multiselect: sem botão, clica a opção selecionada para desselecionar', async () => {
    const f = field(`<div class="multiselect">
      <div class="multiselect__select"></div>
      <div class="multiselect__tags"><span class="multiselect__single">Sim</span><input class="multiselect__input"></div>
      <ul><li class="multiselect__element"><span class="multiselect__option multiselect__option--selected">Sim</span></li></ul>
    </div>`);
    const ms = f.querySelector('.multiselect') as HTMLElement;
    f.querySelector('.multiselect__select')?.addEventListener('mousedown', () =>
      ms.classList.add('multiselect--active'),
    );
    const option = f.querySelector('.multiselect__option') as HTMLElement;
    option.addEventListener('click', () => {
      f.querySelector('.multiselect__single')?.remove();
      ms.classList.remove('multiselect--active');
    });
    await vueMultiselectAdapter.clear?.(f);
    expect(vueMultiselectAdapter.read(f)).toBeNull();
  });

  it('vue-multiselect: sem valor é no-op; falha vira write-failed', async () => {
    const empty = field('<div class="multiselect"><div class="multiselect__tags"></div></div>');
    await expect(vueMultiselectAdapter.clear?.(empty)).resolves.toBeUndefined();
    const stuck = field(
      '<div class="multiselect"><div class="multiselect__clear">×</div><span class="multiselect__single">Sim</span></div>',
    );
    await expect(vueMultiselectAdapter.clear?.(stuck)).rejects.toMatchObject({
      code: 'write-failed',
    });
  });
});
