import { onMounted, onUnmounted } from 'vue';
import {
  PICKER_DRAFT_KEY,
  normalizeLabel,
  parsePickerDraft,
  type Capture,
  type PickerDraft,
} from '../../../core/locator';
import { triggerFrames, type Rule } from '../../../core/model';
import {
  hostOfPattern,
  newFieldDraft,
  newRuleDraft,
  ruleToDraft,
  type FieldDraft,
  type RuleDraft,
} from './draft';

/** Rascunhos mais antigos que isto (ex.: sobra de uma abertura que falhou) são descartados. */
export const PICKER_DRAFT_MAX_AGE_MS = 10 * 60 * 1000;

export const EMPTY_VALUE_HINT = '(vazio)';

/** Para onde o editor deve levar o foco depois de abrir a partir de uma captura. */
export interface CaptureFocus {
  fieldId: string;
  /** "valor atual na página: …" */
  hint: string;
  /** O campo já existia na regra: nada foi adicionado. */
  duplicate: boolean;
}

export interface CaptureEditor {
  draft: RuleDraft;
  focus: CaptureFocus;
}

// ---------------------------------------------------------------- casamento com regras

function sameContainer(rule: Rule, capture: Capture): boolean {
  const a = rule.trigger.container;
  const b = capture.container;
  if (!a || !b) return !a && !b;
  return a.selector === b.selector && (a.textContains ?? '') === (b.textContains ?? '');
}

/** Regras cujo gatilho já cobre a página e o contêiner capturados (candidatas a receber o campo). */
export function findMatchingRules(rules: readonly Rule[], capture: Capture): Rule[] {
  return rules.filter(
    (r) =>
      r.trigger.urlPatterns.includes(capture.urlPattern) &&
      sameContainer(r, capture) &&
      triggerFrames(r.trigger) === (capture.frames ?? 'top'),
  );
}

// ---------------------------------------------------------------- rascunhos

export function suggestRuleName(capture: Capture): string {
  return (
    capture.container?.textContains?.trim() || hostOfPattern(capture.urlPattern) || 'Nova regra'
  );
}

function locatorValueOf(capture: Capture): string {
  const l = capture.locator;
  return l.by === 'label' ? l.text : l.by === 'selector' ? l.css : l.name;
}

export function valueHint(capture: Capture): string {
  const v = (capture.currentValue ?? '').trim();
  return `valor atual na página: ${v === '' ? EMPTY_VALUE_HINT : v}`;
}

/** Campo novo (valor vazio) a partir da captura. */
export function captureToFieldDraft(
  capture: Capture,
  fields: readonly { id: string }[],
): FieldDraft {
  return {
    ...newFieldDraft(fields),
    locatorBy: capture.locator.by,
    locatorValue: locatorValueOf(capture),
    adapter: capture.adapter,
  };
}

export function sameLocator(f: FieldDraft, capture: Capture): boolean {
  if (f.locatorBy !== capture.locator.by) return false;
  const a = f.locatorValue.trim();
  const b = locatorValueOf(capture);
  return capture.locator.by === 'label' ? normalizeLabel(a) === normalizeLabel(b) : a === b;
}

/** Regra nova com nome sugerido, URL, contêiner e o campo capturado. */
export function newRuleFromCapture(capture: Capture): CaptureEditor {
  const draft = newRuleDraft();
  draft.name = suggestRuleName(capture);
  draft.urlPatterns = [capture.urlPattern];
  if (capture.frames === 'all') draft.allFrames = true;
  draft.containerSelector = capture.container?.selector ?? '';
  draft.containerText = capture.container?.textContains ?? '';
  const field = captureToFieldDraft(capture, draft.fields);
  draft.fields = [field];
  return { draft, focus: { fieldId: field.id, hint: valueHint(capture), duplicate: false } };
}

/** Regra existente + campo capturado; se o localizador já existe, devolve o campo existente. */
export function addCaptureToRule(rule: Rule, capture: Capture): CaptureEditor {
  const draft = ruleToDraft(rule);
  const hint = valueHint(capture);
  const existing = draft.fields.find((f) => sameLocator(f, capture));
  if (existing) return { draft, focus: { fieldId: existing.id, hint, duplicate: true } };
  const field = captureToFieldDraft(capture, draft.fields);
  draft.fields = [...draft.fields, field];
  return { draft, focus: { fieldId: field.id, hint, duplicate: false } };
}

// ---------------------------------------------------------------- consumo único

export interface PickerStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
}

/** Lê e APAGA 'picker:draft'. Devolve null se não há rascunho válido e recente. */
export async function consumePickerDraft(
  area: PickerStorageArea,
  now: number = Date.now(),
): Promise<PickerDraft | null> {
  const raw = (await area.get(PICKER_DRAFT_KEY))[PICKER_DRAFT_KEY];
  if (raw === undefined) return null;
  await area.remove(PICKER_DRAFT_KEY);
  const draft = parsePickerDraft(raw);
  if (!draft || now - draft.createdAt > PICKER_DRAFT_MAX_AGE_MS) return null;
  return draft;
}

/**
 * Consome o rascunho ao montar e a cada vez que 'picker:draft' muda em `storage.local`
 * (a página de opções já aberta é focada pelo background). Consumos são serializados.
 */
export function usePickerDraft(onDraft: (draft: PickerDraft) => void | Promise<void>): void {
  let chain: Promise<void> = Promise.resolve();
  const consume = (): void => {
    chain = chain
      .then(async () => {
        const draft = await consumePickerDraft(browser.storage.local);
        if (draft) await onDraft(draft);
      })
      .catch((e: unknown) => console.warn('[assistente] falha ao consumir a captura', e));
  };
  const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string): void => {
    if (areaName === 'local' && changes[PICKER_DRAFT_KEY]?.newValue !== undefined) consume();
  };
  onMounted(() => {
    consume();
    browser.storage.onChanged.addListener(onChanged);
  });
  onUnmounted(() => browser.storage.onChanged.removeListener(onChanged));
}
