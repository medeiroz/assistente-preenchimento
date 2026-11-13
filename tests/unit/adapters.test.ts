import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AdapterError,
  createAdapterRegistry,
  createDefaultRegistry,
  dateAdapter,
  nativeChoiceAdapter,
  nativeSelectAdapter,
  nativeTextAdapter,
  vueMultiselectAdapter,
  type FieldAdapter,
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

describe('nativeTextAdapter', () => {
  it('detecta inputs de texto e textarea', () => {
    for (const type of ['text', 'number', 'email', 'tel', 'search', 'url']) {
      expect(nativeTextAdapter.detect(field(`<input type="${type}">`))).toBe(true);
    }
    expect(nativeTextAdapter.detect(field('<input>'))).toBe(true);
    expect(nativeTextAdapter.detect(field('<textarea></textarea>'))).toBe(true);
  });

  it('não detecta outros controles, múltiplos ou multiselect', () => {
    expect(nativeTextAdapter.detect(field('<input type="checkbox">'))).toBe(false);
    expect(nativeTextAdapter.detect(field('<select></select>'))).toBe(false);
    expect(nativeTextAdapter.detect(field('<input><input>'))).toBe(false);
    expect(nativeTextAdapter.detect(field('<div class="multiselect"><input></div>'))).toBe(false);
    expect(nativeTextAdapter.detect(field('<p>nada</p>'))).toBe(false);
  });

  it('read devolve string, vazio como "" e null sem controle', () => {
    expect(nativeTextAdapter.read(field('<input value="abc">'))).toBe('abc');
    expect(nativeTextAdapter.read(field('<input>'))).toBe('');
    expect(nativeTextAdapter.read(field('<p></p>'))).toBeNull();
  });

  it('isDefault compara com defaultValue ou vazio', () => {
    const f = field('<input value="x">');
    expect(nativeTextAdapter.isDefault(f)).toBe(false);
    expect(nativeTextAdapter.isDefault(f, 'x')).toBe(true);
    expect(nativeTextAdapter.isDefault(field('<input>'))).toBe(true);
    expect(nativeTextAdapter.isDefault(field('<input>'), 'x')).toBe(false);
  });

  it('write usa setter nativo, dispara input/change e faz blur', async () => {
    const f = field('<input>');
    const input = f.querySelector('input') as HTMLInputElement;
    const events: string[] = [];
    for (const t of ['focus', 'input', 'change', 'blur']) {
      input.addEventListener(t, () => events.push(t));
    }
    // Um setter próprio na instância não deve ser usado: só o do protótipo.
    let shadowCalls = 0;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () =>
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.get?.call(input),
      set: () => {
        shadowCalls++;
      },
    });
    await nativeTextAdapter.write(f, '126029000');
    expect(shadowCalls).toBe(0);
    expect(input.value).toBe('126029000');
    expect(events).toEqual(['focus', 'input', 'change', 'blur']);
    expect(nativeTextAdapter.verify(f, '126029000')).toBe(true);
    expect(nativeTextAdapter.verify(f, 'outro')).toBe(false);
  });

  it('write funciona em textarea', async () => {
    const f = field('<textarea></textarea>');
    await nativeTextAdapter.write(f, 'linha');
    expect(nativeTextAdapter.read(f)).toBe('linha');
  });

  it('write em readonly/disabled lança write-failed', async () => {
    for (const attr of ['readonly', 'disabled']) {
      const f = field(`<input ${attr}>`);
      await expect(nativeTextAdapter.write(f, 'x')).rejects.toMatchObject({
        name: 'AdapterError',
        code: 'write-failed',
      });
      expect(nativeTextAdapter.read(f)).toBe('');
    }
  });

  it('write sem controle lança control-not-found', async () => {
    const err = await nativeTextAdapter.write(field('<p></p>'), 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as AdapterError).code).toBe('control-not-found');
  });
});

describe('registry', () => {
  const fake = (id: FieldAdapter['id'], accepts: boolean): FieldAdapter => ({
    id,
    detect: () => accepts,
    read: () => null,
    isDefault: () => true,
    write: async () => {},
    verify: () => true,
  });

  it('resolve auto respeita prioridade decrescente', () => {
    const registry = createAdapterRegistry();
    registry.register(fake('native-text', true), 10);
    registry.register(fake('vue-multiselect', true), 100);
    expect(registry.resolve(document.body, 'auto')?.id).toBe('vue-multiselect');
    expect(registry.list().map((a) => a.id)).toEqual(['vue-multiselect', 'native-text']);
  });

  it('resolve(id) devolve só aquele adaptador, se detect aceitar', () => {
    const registry = createAdapterRegistry();
    registry.register(fake('native-text', true), 10);
    registry.register(fake('vue-multiselect', false), 100);
    expect(registry.resolve(document.body, 'native-text')?.id).toBe('native-text');
    expect(registry.resolve(document.body, 'vue-multiselect')).toBeNull();
    expect(registry.resolve(document.body, 'date')).toBeNull();
    expect(registry.resolve(document.body, 'auto')?.id).toBe('native-text');
  });

  it('auto sem nenhum detect aceitando devolve null', () => {
    const registry = createAdapterRegistry();
    registry.register(fake('native-text', false), 10);
    expect(registry.resolve(document.body, 'auto')).toBeNull();
  });

  it('createDefaultRegistry registra vue-multiselect, date, native-select, native-choice e native-text', () => {
    const registry = createDefaultRegistry();
    expect(registry.list()).toEqual([
      vueMultiselectAdapter,
      dateAdapter,
      nativeSelectAdapter,
      nativeChoiceAdapter,
      nativeTextAdapter,
    ]);
    expect(registry.resolve(field('<input>'), 'auto')).toBe(nativeTextAdapter);
    expect(registry.resolve(field('<div class="multiselect"></div>'), 'auto')).toBe(
      vueMultiselectAdapter,
    );
  });
});

describe('vueMultiselectAdapter contra a fixture da CE', () => {
  const html = readFileSync(resolve(import.meta.dirname, '../fixtures/ce-nfse-modal.html'), 'utf8');

  function fieldByLabel(text: string): Element {
    document.body.innerHTML = html;
    const label = Array.from(document.querySelectorAll('label.eui-label')).find(
      (l) => l.textContent?.replace('*', '').trim() === text,
    );
    const root = label?.closest('.eui-field');
    if (!root) throw new Error(`campo ausente: ${text}`);
    return root;
  }

  it('detect e read no campo Nome', () => {
    const root = fieldByLabel('Nome');
    expect(vueMultiselectAdapter.detect(root)).toBe(true);
    expect(nativeTextAdapter.detect(root)).toBe(false);
    expect(vueMultiselectAdapter.read(root)).toBe('Maria Exemplo Teste');
    expect(vueMultiselectAdapter.isDefault(root)).toBe(false);
    expect(vueMultiselectAdapter.isDefault(root, 'Maria Exemplo Teste')).toBe(true);
    expect(createDefaultRegistry().resolve(root, 'auto')).toBe(vueMultiselectAdapter);
  });

  it('não detecta campos de texto da fixture', () => {
    const root = fieldByLabel('CPF');
    expect(vueMultiselectAdapter.detect(root)).toBe(false);
    expect(createDefaultRegistry().resolve(root, 'auto')).toBe(nativeTextAdapter);
  });

  it('read devolve null sem .multiselect__single', () => {
    const root = fieldByLabel('Nome');
    root.querySelector('.multiselect__single')?.remove();
    expect(vueMultiselectAdapter.read(root)).toBeNull();
    expect(vueMultiselectAdapter.isDefault(root)).toBe(true);
  });
});
