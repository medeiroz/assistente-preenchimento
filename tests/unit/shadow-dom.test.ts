import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_SHADOW_DEPTH, buildCapture, deepQuery, locate } from '../../src/core/locator';
import { locateAll } from '../../src/core/locator/locate';
import { compareDeepOrder } from '../../src/core/locator/deep-query';
import type { Locator } from '../../src/core/model';
import { createDefaultRegistry } from '../../src/core/adapters';
import { createContextWatcher } from '../../src/core/engine';

function host(parent: ParentNode, html: string, mode: 'open' | 'closed' = 'open'): Element {
  const el = document.createElement('x-host');
  (parent as Node).appendChild(el);
  const shadow = el.attachShadow({ mode });
  shadow.innerHTML = html;
  return el;
}

function sr(el: Element): ShadowRoot {
  if (!el.shadowRoot) throw new Error('sem shadow');
  return el.shadowRoot;
}

function ids(els: Element[]): string[] {
  return els.map((e) => e.id);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DeepQuery', () => {
  it('sem shadow root: igual ao querySelectorAll nativo (caminho rápido)', () => {
    document.body.innerHTML = '<input id="a"><div><input id="b"></div>';
    const spy = vi.spyOn(document, 'createTreeWalker');
    expect(ids(deepQuery.querySelectorAll(document, 'input'))).toEqual(['a', 'b']);
    expect(deepQuery.querySelector(document, 'input')?.id).toBe('a');
    // só a varredura de detecção (uma por tarefa); nenhuma travessia por consulta
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it('atravessa shadow roots e respeita a ordem de documento', () => {
    document.body.innerHTML = '<input id="a">';
    const h = host(document.body, '<input id="b"><input id="c">');
    document.body.insertAdjacentHTML('beforeend', '<input id="d">');
    expect(ids(deepQuery.querySelectorAll(document, 'input'))).toEqual(['a', 'b', 'c', 'd']);
    expect(deepQuery.querySelector(h, 'input')?.id).toBe('b');
  });

  it('conteúdo do shadow vem na posição do host, antes dos filhos leves', () => {
    const h = host(document.body, '<input id="s">');
    h.innerHTML = '<input id="light">';
    expect(ids(deepQuery.querySelectorAll(document, 'input'))).toEqual(['s', 'light']);
  });

  it('shadow aninhado', () => {
    const outer = host(document.body, '<input id="o1">');
    const inner = host(sr(outer), '<input id="i1">');
    sr(outer).appendChild(Object.assign(document.createElement('input'), { id: 'o2' }));
    expect(ids(deepQuery.querySelectorAll(document, 'input'))).toEqual(['o1', 'i1', 'o2']);
    expect(deepQuery.querySelector(sr(inner), 'input')?.id).toBe('i1');
  });

  it('shadow root closed é ignorado sem erro', () => {
    host(document.body, '<input id="x">', 'closed');
    document.body.insertAdjacentHTML('beforeend', '<input id="y">');
    expect(ids(deepQuery.querySelectorAll(document, 'input'))).toEqual(['y']);
  });

  it('hosts da própria extensão são ignorados', () => {
    const own = host(document.body, '<input id="mine">');
    own.setAttribute('data-assistente-gravacao', '');
    expect(deepQuery.querySelectorAll(document, 'input')).toEqual([]);
  });

  it('limite de profundidade', () => {
    let tree: ParentNode = document.body;
    for (let i = 0; i < MAX_SHADOW_DEPTH + 2; i++) {
      const h = host(tree, `<input id="n${i}">`);
      tree = sr(h);
    }
    const found = ids(deepQuery.querySelectorAll(document, 'input'));
    expect(found).toContain(`n${MAX_SHADOW_DEPTH - 1}`);
    expect(found).not.toContain(`n${MAX_SHADOW_DEPTH + 1}`);
    expect(found.length).toBe(MAX_SHADOW_DEPTH);
  });

  it('seletor com >>> desce ao shadow de cada match', () => {
    const a = host(document.body, '<x-in id="in1"></x-in>');
    a.id = 'ha';
    const b = host(document.body, '<input id="target">');
    b.id = 'hb';
    expect(ids(deepQuery.querySelectorAll(document, 'x-host >>> input'))).toEqual(['target']);
    expect(ids(deepQuery.querySelectorAll(document, '#hb >>> #target'))).toEqual(['target']);
    expect(deepQuery.querySelectorAll(document, '#ha >>> #target')).toEqual([]);
    expect(deepQuery.querySelector(document, 'x-host >>> >>> input')).toBeNull();
  });

  it('cadeia de dois níveis', () => {
    const outer = host(document.body, '');
    outer.id = 'o';
    const inner = host(sr(outer), '<input id="deep">');
    inner.id = 'in';
    expect(deepQuery.querySelector(document, '#o >>> #in >>> input')?.id).toBe('deep');
  });

  it('compareDeepOrder ordena entre árvores', () => {
    const h = host(document.body, '<input id="s">');
    const light = document.createElement('input');
    document.body.appendChild(light);
    const s = sr(h).firstElementChild as Element;
    expect(compareDeepOrder(h, s)).toBeLessThan(0);
    expect(compareDeepOrder(s, light)).toBeLessThan(0);
    expect(compareDeepOrder(light, s)).toBeGreaterThan(0);
  });
});

describe('locate dentro de shadow DOM', () => {
  it('rótulo fora, input dentro do shadow do host', () => {
    document.body.innerHTML = '<div id="f"><label>Nome</label></div>';
    const f = document.getElementById('f') as Element;
    host(f, '<input id="in">');
    expect(locate({ by: 'label', text: 'Nome' }, document)).toBe(f);
  });

  it('rótulo e input ambos dentro do shadow', () => {
    const h = host(document.body, '<div class="w"><label>Cidade</label><input id="in"></div>');
    const root = locate({ by: 'label', text: 'Cidade' }, document);
    expect(root).toBe(sr(h).querySelector('.w'));
  });

  it('rótulo e input direto no shadow root: a raiz é o host', () => {
    const h = host(document.body, '<label>Bairro</label><input id="in">');
    expect(locate({ by: 'label', text: 'Bairro' }, document)).toBe(h);
  });

  it('label[for] resolve o id na mesma árvore, não no document', () => {
    document.body.innerHTML = '<input id="x" class="fora">';
    const h = host(document.body, '<div class="w"><label for="x">Rua</label><input id="x"></div>');
    const root = locate({ by: 'label', text: 'Rua' }, document);
    expect(root).toBe(sr(h).querySelector('.w'));
  });

  it('shadow aninhado', () => {
    const outer = host(document.body, '');
    const inner = host(sr(outer), '<div class="w"><label>Número</label><input></div>');
    expect(locate({ by: 'label', text: 'Número' }, document)).toBe(sr(inner).querySelector('.w'));
  });

  it('aria-labelledby dentro do shadow', () => {
    const h = host(
      document.body,
      '<span id="l">Rótulo A</span><div class="w"><input aria-labelledby="l"></div>',
    );
    expect(locate({ by: 'label', text: 'Rótulo A' }, document)).toBe(h);
  });

  it('name dentro do shadow', () => {
    const h = host(document.body, '<div class="w"><label>x</label><input name="cpf"></div>');
    expect(locate({ by: 'name', name: 'cpf' }, document)).toBe(sr(h).querySelector('.w'));
  });

  it('seletor >>> e seletor simples (deep)', () => {
    const h = host(document.body, '<input id="in">');
    h.id = 'hh';
    const input = sr(h).querySelector('input');
    expect(locate({ by: 'selector', css: '#hh >>> #in' }, document)).toBe(input);
    expect(locate({ by: 'selector', css: '#in' }, document)).toBe(input);
    expect(locate({ by: 'selector', css: '#hh >>>' }, document)).toBeNull();
  });

  it('locateAll devolve campos de shadows distintos com o mesmo rótulo, em ordem', () => {
    const h1 = host(document.body, '<label>Item</label><input>');
    const h2 = host(document.body, '<label>Item</label><input>');
    expect(locateAll({ by: 'label', text: 'Item' }, document)).toEqual([h1, h2]);
    expect(locate({ by: 'label', text: 'Item', index: 1 }, document)).toBe(h2);
  });

  it('escopo em elemento: não sai do escopo ao subir ancestrais', () => {
    document.body.innerHTML = '<div id="esc"></div><div id="outro"></div>';
    const esc = document.getElementById('esc') as Element;
    host(esc, '<label>Z</label><input>');
    expect(locate({ by: 'label', text: 'Z' }, esc)).not.toBeNull();
    expect(
      locate({ by: 'label', text: 'Z' }, document.getElementById('outro') as Element),
    ).toBeNull();
  });
});

describe('adaptadores em shadow DOM', () => {
  it('native-text preenche o input no shadow; evento composed chega fora', async () => {
    const h = host(document.body, '<label>Nome</label><input id="in">');
    const received: string[] = [];
    document.addEventListener('input', (e) => received.push(`input:${e.composed}`));
    document.addEventListener('change', (e) => received.push(`change:${e.composed}`));
    const adapter = createDefaultRegistry().resolve(h, 'auto');
    expect(adapter?.id).toBe('native-text');
    await adapter?.write(h, 'Maria');
    expect((sr(h).getElementById('in') as HTMLInputElement).value).toBe('Maria');
    expect(adapter?.read(h)).toBe('Maria');
    expect(received).toEqual(['input:true', 'change:true']);
  });

  it('native-select no shadow', async () => {
    const h = host(
      document.body,
      '<select><option value="">-</option><option>Sim</option></select>',
    );
    const adapter = createDefaultRegistry().resolve(h, 'auto');
    expect(adapter?.id).toBe('native-select');
    await adapter?.write(h, 'Sim');
    expect(adapter?.read(h)).toBe('Sim');
  });

  it('checkbox com label[for] no shadow', async () => {
    const h = host(document.body, '<input type="checkbox" id="c"><label for="c">Aceito</label>');
    const adapter = createDefaultRegistry().resolve(h, 'auto');
    expect(adapter?.id).toBe('native-choice');
    await adapter?.write(h, 'Sim');
    expect(adapter?.read(h)).toBe('Sim');
  });
});

describe('captura em shadow DOM', () => {
  function roundTrip(el: Element): Locator {
    const c = buildCapture(el, document, 'https://x.com/');
    if (!c) throw new Error('sem captura');
    expect(locate(c.locator, document)).not.toBeNull();
    return c.locator;
  }

  it('prefere o rótulo quando único', () => {
    const h = host(document.body, '<div class="w"><label>Cidade</label><input id="in"></div>');
    const input = sr(h).getElementById('in') as Element;
    const loc = roundTrip(input);
    expect(loc).toEqual({ by: 'label', text: 'Cidade' });
    expect(locate(loc, document)).toBe(sr(h).querySelector('.w'));
  });

  it('sem rótulo: gera a cadeia host >>> interno', () => {
    const h = host(document.body, '<input id="campo">');
    h.id = 'meu-host';
    const input = sr(h).getElementById('campo') as Element;
    const c = buildCapture(input, document, 'https://x.com/');
    expect(c?.locator).toEqual({ by: 'selector', css: 'x-host#meu-host >>> input#campo' });
    if (c) expect(locate(c.locator, document)).toBe(input);
  });

  it('rótulo repetido: cai em seletor com >>> que resolve exatamente o campo', () => {
    host(document.body, '<label>Item</label><input id="a">');
    const h2 = host(document.body, '<label>Item</label><input id="b">');
    const input = sr(h2).getElementById('b') as Element;
    const c = buildCapture(input, document, 'https://x.com/');
    if (!c) throw new Error('sem captura');
    expect(c.locator.by).not.toBe('label');
    expect(locate(c.locator, document)).toBe(h2);
  });

  it('shadow aninhado: cadeia de dois níveis resolve', () => {
    const outer = host(document.body, '');
    outer.id = 'ext';
    const inner = host(sr(outer), '<input id="alvo">');
    inner.id = 'int';
    const input = sr(inner).getElementById('alvo') as Element;
    const c = buildCapture(input, document, 'https://x.com/');
    if (!c) throw new Error('sem captura');
    expect(locate(c.locator, document)).toBe(input);
  });
});

describe('watcher com shadow DOM', () => {
  it('vê mutações dentro de shadow roots abertos de um contexto', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="modal is-active"><h1>T</h1></div>';
    const modal = document.querySelector('.modal') as Element;
    const h = host(modal, '<div id="slot"></div>');
    const onChange = vi.fn();
    const w = createContextWatcher({
      document,
      container: { selector: '.modal.is-active' },
      settleMs: 100,
      onAppear: vi.fn(),
      onGone: vi.fn(),
      onChange,
    });
    w.start();
    await vi.advanceTimersByTimeAsync(300);
    expect(w.active()).toHaveLength(1);
    sr(h).getElementById('slot')?.appendChild(document.createElement('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    // host novo, com shadow criado depois: também passa a ser observado
    const h2 = host(modal, '<div id="slot2"></div>');
    await vi.advanceTimersByTimeAsync(300);
    onChange.mockClear();
    sr(h2).getElementById('slot2')?.appendChild(document.createElement('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    w.stop();
    vi.useRealTimers();
  });
});
