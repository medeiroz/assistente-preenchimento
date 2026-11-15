import { normalizeLabel, type Capture } from '../locator';
import { RecorderSessionSchema, RecordingDraftSchema } from './schema';
import type { RecordedField, RecorderSession, RecordingDraft, RecordingGroup } from './types';

function containerKey(c: Capture['container']): unknown[] {
  return [c?.selector ?? null, c?.textContains ?? null];
}

function locatorKey(l: Capture['locator']): unknown[] {
  switch (l.by) {
    case 'label':
      return ['label', normalizeLabel(l.text), l.index ?? 0];
    case 'selector':
      return ['selector', l.css];
    case 'name':
      return ['name', l.name];
  }
}

/** Chave estável de um campo: página + contêiner + localizador. */
export function fieldKey(capture: Capture): string {
  return JSON.stringify([
    capture.urlPattern,
    containerKey(capture.container),
    locatorKey(capture.locator),
  ]);
}

/**
 * Insere ou substitui (mesma chave, mesma posição) um campo gravado. Valor vazio remove o
 * campo existente e não adiciona nada. Devolve um array novo.
 */
export function upsertField(fields: RecordedField[], field: RecordedField): RecordedField[] {
  const key = fieldKey(field.capture);
  const idx = fields.findIndex((f) => fieldKey(f.capture) === key);
  if (field.value.trim() === '') return fields.filter((_, i) => i !== idx);
  if (idx < 0) return [...fields, field];
  return fields.map((f, i) => (i === idx ? field : f));
}

/** Agrupa por página + contêiner, na ordem da primeira aparição. */
export function groupFields(fields: RecordedField[]): RecordingGroup[] {
  const groups = new Map<string, RecordingGroup>();
  for (const f of fields) {
    const key = JSON.stringify([f.capture.urlPattern, containerKey(f.capture.container)]);
    let g = groups.get(key);
    if (!g) {
      g = { urlPattern: f.capture.urlPattern, fields: [] };
      if (f.capture.container) g.container = { ...f.capture.container };
      groups.set(key, g);
    }
    g.fields.push(f);
  }
  return [...groups.values()];
}

export function buildRecordingDraft(session: RecorderSession, now: number): RecordingDraft {
  return { createdAt: now, groups: groupFields(session.fields) };
}

/** Valida o que veio do storage; null para lixo. */
export function parseRecorderSession(raw: unknown): RecorderSession | null {
  const r = RecorderSessionSchema.safeParse(raw);
  return r.success ? (r.data as RecorderSession) : null;
}

export function parseRecordingDraft(raw: unknown): RecordingDraft | null {
  const r = RecordingDraftSchema.safeParse(raw);
  return r.success ? (r.data as RecordingDraft) : null;
}
