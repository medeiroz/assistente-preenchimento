import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURE_PATH = resolve(import.meta.dirname, '../fixtures/ce-nfse-modal.html');
const html = readFileSync(FIXTURE_PATH, 'utf-8');

const MODAL_TITLE = 'Emitir Nota Fiscal de Serviços Eletrônica';

// Rótulos dos 37 campos, na ordem da spec (ce-nfse-modal.spec.md, seção "Lista de campos").
// A spec conta 14 campos na seção "Dados do cliente", mas o seletor de país do Telefone
// fica dentro do próprio campo "Telefone*" (não tem rótulo próprio), então a contagem
// de `.eui-field` é 13 + 24 = 37.
const EXPECTED_LABELS = [
  'Não enviar dados do tomador na emissão da nota',
  'Tipo de pessoa*',
  'Nome*',
  'CPF*',
  'Telefone*',
  'E-mail*',
  'Código postal*',
  'Estado*',
  'Cidade*',
  'Bairro*',
  'Rua*',
  'Número*',
  'Complemento',
  'Descrição*',
  'Data de competência',
  'Código tributário municipal',
  'Código de tributação municipal do ISSQN',
  'Código de tributação nacional do ISSQN',
  'ISS',
  'Código NBS',
  'Código da Situação Tributária do IBS/CBS',
  'Código de Classificação Tributária do IBS/CBS',
  'Código indicador da operação',
  'Operação de uso ou consumo pessoal',
  'Tipo de operação governamental',
  'Alíquota da UF para IBS',
  'Alíquota do Município para IBS',
  'Alíquota da União para CBS',
  'Alíq. do serviço prestado relativo ao município',
  'Código interno do contribuinte',
  'Informações adicionais',
  'Alíq. aproximada dos tributos municipais (%)',
  'Alíq. aproximada dos tributos estaduais (%)',
  'Alíq. aproximada dos tributos federais (%)',
  'Valor aproximado dos tributos municipais (R$)',
  'Valor aproximado dos tributos estaduais (R$)',
  'Valor aproximado dos tributos federais (R$)',
];

function loadDoc(): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function labelOf(field: Element): string {
  return field.querySelector('label')?.textContent?.trim() ?? '';
}

function findField(doc: Document, label: string): Element {
  const field = Array.from(doc.querySelectorAll('.eui-field')).find((f) => labelOf(f) === label);
  if (!field) throw new Error(`campo não encontrado: ${label}`);
  return field;
}

describe('fixture ce-nfse-modal.html', () => {
  it('tem exatamente um modal ativo com o título esperado', () => {
    const doc = loadDoc();
    const active = doc.querySelectorAll('.eui-modal-wrapper.is-active');
    expect(active.length).toBe(1);
    expect(active[0]?.textContent).toContain(MODAL_TITLE);
  });

  it('tem 37 campos .eui-field, todos com rótulo não vazio', () => {
    const doc = loadDoc();
    const fields = Array.from(doc.querySelectorAll('.eui-field'));
    const withLabel = fields.filter((f) => labelOf(f) !== '');
    expect(fields.length).toBe(37);
    expect(withLabel.length).toBe(37);
  });

  it('o campo "Código NBS" é um input.eui-input-text vazio', () => {
    const doc = loadDoc();
    const input = findField(doc, 'Código NBS').querySelector('input.eui-input-text');
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('o campo "Operação de uso ou consumo pessoal" é um multiselect sem valor com opções Não/Sim', () => {
    const doc = loadDoc();
    const field = findField(doc, 'Operação de uso ou consumo pessoal');
    const combobox = field.querySelector('.multiselect[role=combobox]');
    expect(combobox).not.toBeNull();
    expect(combobox?.querySelector('.multiselect__placeholder')?.textContent?.trim()).toBe(
      'Selecione',
    );
    expect(combobox?.querySelector('.multiselect__single')).toBeNull();
    const options = Array.from(
      combobox?.querySelectorAll('li.multiselect__element[role=option]') ?? [],
    ).map((li) => li.textContent?.trim());
    expect(options).toEqual(['Não', 'Sim']);
  });

  it('os 37 rótulos aparecem na ordem da spec', () => {
    const doc = loadDoc();
    const labels = Array.from(doc.querySelectorAll('.eui-field')).map(labelOf);
    expect(labels).toEqual(EXPECTED_LABELS);
  });

  it('contém apenas dados fictícios conhecidos', () => {
    const doc = loadDoc();
    const inputValues = Array.from(doc.querySelectorAll('input'))
      .map((input) => input.getAttribute('value') ?? '')
      .filter((value) => value !== '');
    const text = `${doc.body.textContent ?? ''}\n${inputValues.join('\n')}`;

    const ALLOWED_CPF = ['123.456.789-09'];
    const ALLOWED_PHONE = ['(11) 90000-0000'];
    const ALLOWED_CEP = ['01000-000'];
    const ALLOWED_SINGLES = ['Maria Exemplo Teste', 'São Paulo', 'Cidade Exemplo', '+55'];
    const ALLOWED_INPUT_VALUES = [
      '123.456.789-09',
      'maria.exemplo@example.com',
      '(11) 90000-0000',
      '01000-000',
      'Bairro Exemplo',
      'Rua Exemplo',
      '100',
    ];

    const cpfs = text.match(/(?<![\d.])\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g) ?? [];
    for (const cpf of cpfs) expect(ALLOWED_CPF, `CPF não fictício: ${cpf}`).toContain(cpf);

    const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    for (const email of emails) {
      expect(email, `e-mail não fictício: ${email}`).toMatch(/@example\.com$/);
    }

    const phones = text.match(/\(\d{2}\) \d{4,5}-\d{4}/g) ?? [];
    for (const phone of phones)
      expect(ALLOWED_PHONE, `telefone não fictício: ${phone}`).toContain(phone);

    const ceps = text.match(/(?<!\d)\d{5}-\d{3}(?!\d)/g) ?? [];
    for (const cep of ceps) expect(ALLOWED_CEP, `CEP não fictício: ${cep}`).toContain(cep);

    const singles = Array.from(doc.querySelectorAll('.multiselect__single')).map(
      (el) => el.textContent?.trim() ?? '',
    );
    for (const single of singles) {
      expect(ALLOWED_SINGLES, `valor de multiselect não fictício: ${single}`).toContain(single);
    }

    for (const value of inputValues) {
      expect(ALLOWED_INPUT_VALUES, `valor de input não fictício: ${value}`).toContain(value);
    }
  });

  it('não contém CSS, JS nem URLs externas', () => {
    expect(html).not.toMatch(/<script|<style|<link/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });
});
