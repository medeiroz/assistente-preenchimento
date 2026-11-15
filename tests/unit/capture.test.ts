import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCapture, locate, resolveField, type Capture } from '../../src/core/locator';

const html = readFileSync(resolve(import.meta.dirname, '../fixtures/ce-nfse-modal.html'), 'utf-8');
const URL_CE = 'https://app.clinicaexperts.com.br/notas?x=1';
const URL_X = 'https://x.com/';
const TITLE = 'Emitir Nota Fiscal de Serviços Eletrônica';

function loadDoc(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function inline(body: string): Document {
  return new DOMParser().parseFromString(`<body>${body}</body>`, 'text/html');
}

function q(root: ParentNode, selector: string): Element {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`não encontrado: ${selector}`);
  return el;
}

function capture(el: Element, url = URL_X): Capture {
  const c = buildCapture(el, el.ownerDocument, url);
  if (!c) throw new Error('sem captura');
  return c;
}

/** `.eui-field` cujo rótulo (sem `*`) é `label`. */
function fieldOf(doc: Document, label: string): Element {
  const f = Array.from(doc.querySelectorAll('.eui-field')).find(
    (el) =>
      el
        .querySelector('label')
        ?.textContent?.replace(/[\s*]+$/, '')
        .trim() === label,
  );
  if (!f) throw new Error(`campo não encontrado: ${label}`);
  return f;
}

describe('buildCapture (fixture CE)', () => {
  const doc = loadDoc();
  const container = q(doc, '.eui-modal-wrapper.is-active');

  it('"Código NBS": label + native-text + container + urlPattern', () => {
    const c = capture(q(fieldOf(doc, 'Código NBS'), 'input'), URL_CE);
    expect(c.locator).toEqual({ by: 'label', text: 'Código NBS' });
    expect(c.label).toBe('Código NBS');
    expect(c.adapter).toBe('native-text');
    expect(c.currentValue).toBe('');
    expect(c.container).toEqual({ selector: '.eui-modal-wrapper.is-active', textContains: TITLE });
    expect(c.urlPattern).toBe('https://app.clinicaexperts.com.br/*');
  });

  it('"Operação de uso ou consumo pessoal": label + vue-multiselect', () => {
    const c = capture(q(fieldOf(doc, 'Operação de uso ou consumo pessoal'), '.multiselect'));
    expect(c.locator).toEqual({ by: 'label', text: 'Operação de uso ou consumo pessoal' });
    expect(c.adapter).toBe('vue-multiselect');
  });

  it('"Data de competência": adapter date', () => {
    const c = capture(fieldOf(doc, 'Data de competência'));
    expect(c.locator).toEqual({ by: 'label', text: 'Data de competência' });
    expect(c.adapter).toBe('date');
  });

  it('"Nome*": rótulo sem o asterisco (select com busca)', () => {
    const c = capture(q(fieldOf(doc, 'Nome'), 'input'));
    expect(c.locator).toEqual({ by: 'label', text: 'Nome' });
    expect(c.label).toBe('Nome');
    expect(c.adapter).toBe('vue-multiselect');
    expect(c.currentValue).toBe('Maria Exemplo Teste');
  });

  it('switch: native-choice', () => {
    const c = capture(q(fieldOf(doc, 'Não enviar dados do tomador na emissão da nota'), 'input'));
    expect(c.locator.by).toBe('label');
    expect(c.adapter).toBe('native-choice');
  });

  it('clicar em elementos internos resolve a mesma raiz', () => {
    const consumo = fieldOf(doc, 'Operação de uso ou consumo pessoal');
    const placeholder = q(consumo, '.multiselect__placeholder');
    expect(resolveField(placeholder)?.root).toBe(consumo);
    expect(resolveField(q(consumo, '.multiselect__tags'))?.root).toBe(consumo);

    const nbs = fieldOf(doc, 'Código NBS');
    expect(resolveField(q(nbs, '.eui-label-help'))?.root).toBe(nbs);
    expect(resolveField(q(nbs, 'label'))?.root).toBe(nbs);
    expect(resolveField(nbs)?.root).toBe(nbs);

    expect(capture(placeholder)).toEqual(capture(q(consumo, '.multiselect')));
  });

  it('elementos fora de campos não resolvem', () => {
    expect(resolveField(q(doc, '.eui-modal-title'))).toBeNull();
    expect(resolveField(q(doc, '.eui-modal-body'))).toBeNull();
    expect(buildCapture(doc.body, doc, URL_CE)).toBeNull();
  });

  it('ida-e-volta: locate(locator, container) devolve a raiz, para todos os campos', () => {
    const roots = Array.from(doc.querySelectorAll('.eui-field'));
    expect(roots.length).toBe(37);
    for (const root of roots) {
      const el = root.querySelector('input, select, textarea, .multiselect') ?? root;
      const c = capture(el, URL_CE);
      expect(locate(c.locator, container), JSON.stringify(c.locator)).toBe(root);
    }
  });

  it('container: ancestral modal com o título do diálogo', () => {
    const c = capture(q(fieldOf(doc, 'Código NBS'), 'input'), URL_CE);
    expect(c.container?.selector).toBe('.eui-modal-wrapper.is-active');
    expect(c.container?.textContains).toBe(TITLE);
  });
});

describe('buildCapture (casos inline)', () => {
  it('sem diálogo: sem container; urlPattern por host', () => {
    const doc = inline('<div class="f"><label for="a">Cidade</label><input id="a"></div>');
    const c = capture(q(doc, 'input'), 'http://127.0.0.1:8123/p');
    expect(c.container).toBeUndefined();
    expect(c.urlPattern).toBe('http://127.0.0.1/*');
    expect(c.locator).toEqual({ by: 'label', text: 'Cidade' });
  });

  it('[role=dialog] vira contêiner, com o primeiro heading como texto', () => {
    const doc = inline(
      '<div role="dialog"><h2>  Meu   título </h2><div class="f"><label>Valor</label><input></div></div>',
    );
    expect(capture(q(doc, 'input')).container).toEqual({
      selector: '[role="dialog"]',
      textContains: 'Meu título',
    });
  });

  it('dialog[open] e classe genérica "modal" visível', () => {
    const d1 = inline('<dialog open><h1>Aviso</h1><div><label>A</label><input></div></dialog>');
    expect(capture(q(d1, 'input')).container).toEqual({
      selector: 'dialog[open]',
      textContains: 'Aviso',
    });
    const d2 = inline(
      '<div class="my-modal-box"><h4>Cadastro</h4><div><label>A</label><input></div></div>',
    );
    expect(capture(q(d2, 'input')).container).toEqual({
      selector: '.my-modal-box',
      textContains: 'Cadastro',
    });
  });

  it('título maior que 80 caracteres é truncado', () => {
    const long = 'A'.repeat(120);
    const doc = inline(
      `<div role="dialog"><h2>${long}</h2><div><label>A</label><input></div></div>`,
    );
    expect(capture(q(doc, 'input')).container?.textContains).toBe('A'.repeat(80));
  });

  it('rótulo ambíguo com name único: usa name e volta à raiz certa', () => {
    const doc = inline(`
      <section>
        <div class="row"><label>Valor</label><input name="v1"></div>
        <div class="row"><label>Valor</label><input name="v2"></div>
      </section>`);
    const second = doc.querySelectorAll('.row')[1] as Element;
    const c = capture(q(second, 'input'));
    expect(c.locator).toEqual({ by: 'name', name: 'v2' });
    expect(locate(c.locator, doc)).toBe(second);
  });

  it('rótulo ambíguo sem name: seletor curto que volta à raiz certa', () => {
    const doc = inline(`
      <section>
        <div class="row"><label>Valor</label><input></div>
        <div class="row"><label>Valor</label><input></div>
      </section>`);
    for (const row of Array.from(doc.querySelectorAll('.row'))) {
      const c = capture(q(row, 'input'));
      expect(c.locator.by).toBe('selector');
      expect(locate(c.locator, doc)).toBe(row);
      if (c.locator.by === 'selector') expect(c.locator.css.length).toBeLessThan(40);
    }
  });

  it('seletor evita ids numéricos e classes de estado', () => {
    const doc = inline(`
      <div class="wrap">
        <div id="123" class="box is-active has-value multiselect--active"><label>X</label><input></div>
        <div id="124" class="box is-active has-value"><label>X</label><input></div>
      </div>`);
    const box = q(doc, '[id="124"]');
    const c = capture(q(box, 'input'));
    expect(c.locator.by).toBe('selector');
    const css = c.locator.by === 'selector' ? c.locator.css : '';
    expect(css).not.toMatch(/#12|is-active|has-value|multiselect--active/);
    expect(locate(c.locator, doc)).toBe(box);
  });

  it('prefere data-cy quando o próprio campo tem', () => {
    const doc = inline(`
      <div><div data-cy="cidade"><label>Local</label><input></div>
      <div data-cy="outro"><label>Local</label><input></div></div>`);
    const root = q(doc, '[data-cy="outro"]');
    expect(capture(q(root, 'input')).locator).toEqual({
      by: 'selector',
      css: 'div[data-cy="outro"]',
    });
  });

  it('radios: o clique numa opção resolve o grupo pelo rótulo do grupo', () => {
    const doc = inline(`
      <div class="eui-field"><label class="eui-label">Tipo de conta</label>
        <div class="eui-control">
          <input id="r1" type="radio" name="tc" value="a"><label for="r1">Residencial</label>
          <input id="r2" type="radio" name="tc" value="b"><label for="r2">Comercial</label>
        </div></div>`);
    const c = capture(q(doc, '[id="r2"]'));
    expect(c.locator).toEqual({ by: 'label', text: 'Tipo de conta' });
    expect(c.adapter).toBe('native-choice');
    expect(locate(c.locator, doc)).toBe(q(doc, '.eui-field'));
  });

  it('botão com aria-label (Fechar) não transforma o diálogo inteiro em campo', () => {
    const doc = inline(`
      <div role="dialog"><button aria-label="Fechar">x</button><h3 id="t">Seção</h3>
        <div class="f"><label>A</label><input></div></div>`);
    expect(resolveField(q(doc, '#t'))).toBeNull();
    expect(resolveField(q(doc, 'input'))?.root).toBe(q(doc, '.f'));
  });

  it('campo sem rótulo: usa o próprio controle (name)', () => {
    const doc = inline('<form><input name="q" type="text"></form>');
    const c = capture(q(doc, 'input'));
    expect(c.label).toBeNull();
    expect(c.locator.by === 'name' || c.locator.by === 'selector').toBe(true);
  });

  it('sem adapter compatível: adapter "auto" e valor null', () => {
    const doc = inline('<div><label>Obs</label><div role="combobox"></div></div>');
    const c = capture(q(doc, '[role=combobox]'));
    expect(c.adapter).toBe('auto');
    expect(c.currentValue).toBeNull();
  });
});
