import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locate, normalizeLabel } from '../../src/core/locator';

const html = readFileSync(resolve(import.meta.dirname, '../fixtures/ce-nfse-modal.html'), 'utf-8');

function loadDoc(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function inline(body: string): Document {
  return new DOMParser().parseFromString(`<body>${body}</body>`, 'text/html');
}

describe('normalizeLabel', () => {
  it('remove *, :, acentos, espaços extras e caixa', () => {
    expect(normalizeLabel('  Código   NBS * ')).toBe('codigo nbs');
    expect(normalizeLabel('Nome:')).toBe('nome');
    expect(normalizeLabel('Alíq. do Município')).toBe('aliq. do municipio');
  });
});

describe('locate by label (fixture CE)', () => {
  const doc = loadDoc();

  it('"Código NBS" retorna a .eui-field do input', () => {
    const root = locate({ by: 'label', text: 'Código NBS' }, doc);
    expect(root?.classList.contains('eui-field')).toBe(true);
    expect(root?.querySelector('input')?.getAttribute('data-cy')).toBe('default-input-text');
    expect(root?.querySelector('label')?.textContent?.trim()).toBe('Código NBS');
  });

  it('"Operação de uso ou consumo pessoal" contém o multiselect combobox', () => {
    const root = locate({ by: 'label', text: 'Operação de uso ou consumo pessoal' }, doc);
    expect(root?.querySelector('.multiselect[role=combobox]')).not.toBeNull();
  });

  it('"Nome" casa com "Nome*" e "codigo nbs" casa com acentos/caixa', () => {
    const nome = locate({ by: 'label', text: 'Nome' }, doc);
    expect(nome?.querySelector('label')?.textContent).toContain('Nome*');
    expect(locate({ by: 'label', text: 'codigo nbs' }, doc)).toBe(
      locate({ by: 'label', text: 'Código NBS' }, doc),
    );
  });

  it('rótulo inexistente retorna null', () => {
    expect(locate({ by: 'label', text: 'Campo que não existe' }, doc)).toBeNull();
  });

  it('exact:false faz busca por trecho', () => {
    const root = locate({ by: 'label', text: 'consumo pessoal', exact: false }, doc);
    expect(root?.querySelector('.multiselect[role=combobox]')).not.toBeNull();
    expect(locate({ by: 'label', text: 'consumo pessoal' }, doc)).toBeNull();
  });

  it('respeita o escopo: "Código NBS" não existe em "Dados do cliente"', () => {
    const header = Array.from(doc.querySelectorAll('.eui-section-header')).find(
      (h) => h.textContent?.trim() === 'Dados do cliente',
    );
    const section = header?.closest('.eui-section');
    expect(section).toBeTruthy();
    expect(locate({ by: 'label', text: 'Código NBS' }, section as Element)).toBeNull();
    expect(locate({ by: 'label', text: 'Nome' }, section as Element)).not.toBeNull();
  });

  it('os 37 rótulos localizam raízes distintas, todas .eui-field', () => {
    const labels = Array.from(doc.querySelectorAll('.eui-field > label')).map(
      (l) => l.textContent?.trim() ?? '',
    );
    expect(labels).toHaveLength(37);
    const roots = new Set<Element>();
    for (const text of labels) {
      const root = locate({ by: 'label', text }, doc);
      expect(root, text).not.toBeNull();
      expect(root?.classList.contains('eui-field'), text).toBe(true);
      if (root) roots.add(root);
    }
    expect(roots.size).toBe(37);
  });
});

describe('locate by label (HTML inline)', () => {
  it('ambiguidade: index escolhe entre duplicatas; fora do range retorna null', () => {
    const doc = inline(`
      <div class="f" id="a"><label>Valor</label><input></div>
      <div class="f" id="b"><label>Valor</label><input></div>`);
    const first = locate({ by: 'label', text: 'Valor' }, doc);
    const idx0 = locate({ by: 'label', text: 'Valor', index: 0 }, doc);
    const idx1 = locate({ by: 'label', text: 'Valor', index: 1 }, doc);
    expect(first?.id).toBe('a');
    expect(idx0).toBe(first);
    expect(idx1?.id).toBe('b');
    expect(locate({ by: 'label', text: 'Valor', index: 2 }, doc)).toBeNull();
  });

  it('label[for] com id numérico', () => {
    const doc = inline(
      `<div id="w"><label for="449">Código</label><div><input id="449"></div></div>`,
    );
    expect(locate({ by: 'label', text: 'Código' }, doc)?.id).toBe('w');
  });

  it('controle descendente do label', () => {
    const doc = inline(`<section id="s"><label>Ativo <input type="checkbox"></label></section>`);
    expect(locate({ by: 'label', text: 'Ativo' }, doc)?.id).toBe('s');
  });

  it('aria-labelledby', () => {
    const doc = inline(
      `<div id="r"><span id="t">Cidade</span><div role="combobox" aria-labelledby="t"></div></div>`,
    );
    expect(locate({ by: 'label', text: 'cidade' }, doc)?.id).toBe('r');
  });

  it('[aria-label] em controle retorna o próprio controle', () => {
    const doc = inline(`<div><input id="x" aria-label="Busca"></div>`);
    expect(locate({ by: 'label', text: 'Busca' }, doc)?.id).toBe('x');
  });

  it('campos ocultos contam e ícones vazios são ignorados', () => {
    const doc = inline(
      `<div id="h" style="display:none"><label>Oculto<i class="ico"></i></label><input></div>`,
    );
    expect(locate({ by: 'label', text: 'Oculto' }, doc)?.id).toBe('h');
  });

  it('aceita Element como escopo', () => {
    const doc = inline(`<div id="a"><label>X</label><input></div><div id="b"></div>`);
    const b = doc.getElementById('b') as Element;
    expect(locate({ by: 'label', text: 'X' }, b)).toBeNull();
  });
});

describe('locate by selector / name', () => {
  const doc = inline(`
    <div id="f1"><label>Rótulo</label><input name="cep"></div>`);

  it('selector válido', () => {
    expect(locate({ by: 'selector', css: '#f1' }, doc)?.id).toBe('f1');
    expect(locate({ by: 'selector', css: '#nada' }, doc)).toBeNull();
  });

  it('selector inválido retorna null sem lançar', () => {
    expect(locate({ by: 'selector', css: '###[[' }, doc)).toBeNull();
  });

  it('name: raiz é o menor ancestral com label', () => {
    expect(locate({ by: 'name', name: 'cep' }, doc)?.id).toBe('f1');
  });

  it('name sem label: o próprio controle', () => {
    const alone = inline(`<div><input name="solto"></div>`);
    expect(locate({ by: 'name', name: 'solto' }, alone)?.tagName).toBe('INPUT');
  });

  it('name inexistente retorna null', () => {
    expect(locate({ by: 'name', name: 'zzz' }, doc)).toBeNull();
  });
});
