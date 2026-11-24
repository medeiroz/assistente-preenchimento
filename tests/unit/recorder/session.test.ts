import { describe, expect, it } from 'vitest';
import {
  buildRecordingDraft,
  fieldKey,
  groupFields,
  parseRecorderSession,
  parseRecordingDraft,
  upsertField,
} from '../../../src/core/recorder';
import { cap, field } from './helpers';

describe('fieldKey', () => {
  it('normaliza rótulos (acento, caixa, dois-pontos)', () => {
    expect(fieldKey(cap('Descrição:'))).toBe(fieldKey(cap('descricao *')));
  });
  it('distingue página, contêiner e índice', () => {
    const base = fieldKey(cap('Nome'));
    expect(fieldKey(cap('Nome', { urlPattern: 'https://outro.test/*' }))).not.toBe(base);
    expect(fieldKey(cap('Nome', { container: { selector: '.m' } }))).not.toBe(base);
    expect(fieldKey(cap('Nome', { container: { selector: '.m', textContains: 'x' } }))).not.toBe(
      fieldKey(cap('Nome', { container: { selector: '.m' } })),
    );
    expect(fieldKey(cap('Nome', { locator: { by: 'label', text: 'Nome', index: 1 } }))).not.toBe(
      base,
    );
  });
  it('suporta seletor e name', () => {
    expect(fieldKey(cap('a', { locator: { by: 'selector', css: '#a' } }))).not.toBe(
      fieldKey(cap('a', { locator: { by: 'name', name: 'a' } })),
    );
  });
});

describe('upsertField', () => {
  it('adiciona, substitui mantendo a posição e não muta', () => {
    const a = field('A', '1');
    const b = field('B', '2');
    const l1 = upsertField(upsertField([], a), b);
    const l2 = upsertField(l1, field('A', '9'));
    expect(l2.map((f) => f.value)).toEqual(['9', '2']);
    expect(l1.map((f) => f.value)).toEqual(['1', '2']);
  });
  it('valor vazio remove o existente e não adiciona', () => {
    const l = upsertField([field('A', '1')], field('A', '  '));
    expect(l).toEqual([]);
    expect(upsertField([], field('Z', ''))).toEqual([]);
  });
});

describe('groupFields / buildRecordingDraft', () => {
  it('agrupa por página + contêiner na ordem da primeira aparição', () => {
    const fs = [
      field('A', '1'),
      field('B', '2', { urlPattern: 'https://outro.test/*' }),
      field('C', '3', { container: { selector: '.m', textContains: 'Novo' } }),
      field('D', '4'),
    ];
    const g = groupFields(fs);
    expect(g.map((x) => x.fields.map((f) => f.value))).toEqual([['1', '4'], ['2'], ['3']]);
    expect(g[2]?.container).toEqual({ selector: '.m', textContains: 'Novo' });
    expect(g[0]?.container).toBeUndefined();
  });
  it('campos de iframe formam grupo próprio e mantêm frames: all (também após o parse)', () => {
    const fs = [field('A', '1'), field('B', '2', { frames: 'all' })];
    const g = groupFields(fs);
    expect(g).toHaveLength(2);
    expect(g[0]?.frames).toBeUndefined();
    expect(g[1]?.frames).toBe('all');
    const session = { tabId: 1, startedAt: 0, fields: fs };
    expect(parseRecorderSession(session)).toEqual(session);
    const draft = buildRecordingDraft(session, 5);
    expect(parseRecordingDraft(draft)).toEqual(draft);
  });
  it('monta o rascunho', () => {
    const session = { tabId: 1, startedAt: 0, fields: [field('A', '1')] };
    const d = buildRecordingDraft(session, 99);
    expect(d.createdAt).toBe(99);
    expect(d.groups).toHaveLength(1);
  });
});

describe('parse*', () => {
  it('aceita estruturas válidas e rejeita lixo', () => {
    const session = { tabId: 1, startedAt: 0, fields: [field('A', '1')] };
    expect(parseRecorderSession(session)).toEqual(session);
    expect(parseRecorderSession({ tabId: 'x' })).toBeNull();
    expect(parseRecorderSession(undefined)).toBeNull();
    const draft = buildRecordingDraft(session, 5);
    expect(parseRecordingDraft(draft)).toEqual(draft);
    expect(parseRecordingDraft({ createdAt: 1, groups: [{ fields: 1 }] })).toBeNull();
    expect(parseRecordingDraft('lixo')).toBeNull();
  });
});
