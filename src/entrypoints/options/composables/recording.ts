import { onMounted, onUnmounted } from 'vue';
import { z } from 'zod';
import { AdapterIdSchema, LocatorSchema, type Rule } from '../../../core/model';
import type { Capture } from '../../../core/locator';
import {
  RECORDING_DRAFT_KEY,
  RECORDING_DRAFT_MAX_AGE_MS,
  type RecordedField,
  type RecordingDraft,
  type RecordingGroup,
} from '../../../core/recorder/types';
import { newRuleDraft, ruleToDraft, type FieldDraft, type RuleDraft } from './draft';
import {
  captureToFieldDraft,
  findMatchingRules,
  sameLocator,
  suggestRuleName,
  type PickerStorageArea,
} from './picker';

// ---------------------------------------------------------------- validação

const ContainerSchema = z.object({
  selector: z.string().min(1),
  textContains: z.string().optional(),
});

const CaptureSchema = z.object({
  locator: LocatorSchema,
  adapter: z.union([z.literal('auto'), AdapterIdSchema]),
  currentValue: z.string().nullable(),
  label: z.string().nullable(),
  container: ContainerSchema.optional(),
  urlPattern: z.string(),
});

const FieldSchema = z.object({
  capture: CaptureSchema,
  value: z.string(),
  url: z.string(),
  recordedAt: z.number(),
});

const GroupSchema = z.object({
  urlPattern: z.string(),
  container: ContainerSchema.optional(),
  fields: z.array(FieldSchema).min(1),
});

const DraftSchema = z.object({ createdAt: z.number(), groups: z.array(GroupSchema).min(1) });

/** Valida o que veio do storage; null para lixo ou formato antigo. */
export function parseDraft(raw: unknown): RecordingDraft | null {
  const r = DraftSchema.safeParse(raw);
  return r.success ? (r.data as RecordingDraft) : null;
}

// ---------------------------------------------------------------- consumo único

/** Lê e APAGA a chave da gravação. Devolve null se não há rascunho válido e recente. */
export async function consumeRecordingDraft(
  area: PickerStorageArea,
  now: number = Date.now(),
): Promise<RecordingDraft | null> {
  const raw = (await area.get(RECORDING_DRAFT_KEY))[RECORDING_DRAFT_KEY];
  if (raw === undefined) return null;
  await area.remove(RECORDING_DRAFT_KEY);
  const draft = parseDraft(raw);
  if (!draft || now - draft.createdAt > RECORDING_DRAFT_MAX_AGE_MS) return null;
  return draft;
}

/** Mesmo ciclo de vida de `usePickerDraft`: consome ao montar e quando a chave muda. */
export function useRecordingDraft(onDraft: (draft: RecordingDraft) => void | Promise<void>): void {
  let chain: Promise<void> = Promise.resolve();
  const consume = (): void => {
    chain = chain
      .then(async () => {
        const draft = await consumeRecordingDraft(browser.storage.local);
        if (draft) await onDraft(draft);
      })
      .catch((e: unknown) => console.warn('[assistente] falha ao consumir a gravação', e));
  };
  const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string): void => {
    if (areaName === 'local' && changes[RECORDING_DRAFT_KEY]?.newValue !== undefined) consume();
  };
  onMounted(() => {
    consume();
    browser.storage.onChanged.addListener(onChanged);
  });
  onUnmounted(() => browser.storage.onChanged.removeListener(onChanged));
}

// ---------------------------------------------------------------- grupos -> regras

/** `{{` num valor literal vira texto com a barra de escape que o motor de expressões entende. */
export function escapeTemplate(value: string): string {
  return value.replace(/\{\{/g, '\\{{');
}

/** Captura “virtual” do grupo (URL + contêiner), para reaproveitar `findMatchingRules`/nome. */
export function groupCapture(group: RecordingGroup): Capture {
  const first = group.fields[0]?.capture;
  const capture: Capture = {
    locator: first?.locator ?? { by: 'label', text: '' },
    adapter: first?.adapter ?? 'auto',
    currentValue: null,
    label: null,
    urlPattern: group.urlPattern,
  };
  if (group.container) capture.container = group.container;
  return capture;
}

export function findMatchingRulesForGroup(rules: readonly Rule[], group: RecordingGroup): Rule[] {
  return findMatchingRules(rules, groupCapture(group));
}

function recordedToFieldDraft(rf: RecordedField, fields: readonly { id: string }[]): FieldDraft {
  return { ...captureToFieldDraft(rf.capture, fields), value: escapeTemplate(rf.value) };
}

/** Regra nova: nome sugerido, URL, contêiner e um campo por valor gravado. */
export function groupToNewRule(group: RecordingGroup): RuleDraft {
  const draft = newRuleDraft();
  draft.name = suggestRuleName(groupCapture(group));
  draft.urlPatterns = [group.urlPattern];
  draft.containerSelector = group.container?.selector ?? '';
  draft.containerText = group.container?.textContains ?? '';
  const fields: FieldDraft[] = [];
  for (const rf of group.fields) fields.push(recordedToFieldDraft(rf, fields));
  draft.fields = fields;
  return draft;
}

/** Regra existente + campos gravados: atualiza o valor de localizadores iguais, acrescenta o resto. */
export function groupIntoRule(rule: Rule, group: RecordingGroup): RuleDraft {
  const draft = ruleToDraft(rule);
  const fields = [...draft.fields];
  for (const rf of group.fields) {
    const idx = fields.findIndex((f) => sameLocator(f, rf.capture));
    if (idx >= 0) fields[idx] = { ...fields[idx]!, value: escapeTemplate(rf.value) };
    else fields.push(recordedToFieldDraft(rf, fields));
  }
  draft.fields = fields;
  return draft;
}

/** Texto do localizador de um campo gravado (para a lista do painel). */
export function recordedLabel(rf: RecordedField): string {
  const l = rf.capture.locator;
  return rf.capture.label ?? (l.by === 'label' ? l.text : l.by === 'selector' ? l.css : l.name);
}
