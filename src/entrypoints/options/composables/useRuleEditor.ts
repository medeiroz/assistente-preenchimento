import { computed, ref, type Ref } from 'vue';
import type { Config, Rule } from '../../../core/model';
import type { RecordingGroup } from '../../../core/recorder/types';
import { newRuleDraft, ruleToDraft, type RuleDraft } from './draft';
import type { CaptureFocus } from './picker';

export interface Editing {
  draft: RuleDraft;
  /** `updatedAt` da regra quando o editor abriu (null em regra nova). */
  baseUpdatedAt: string | null;
  /** Muda a cada abertura para recriar o componente. */
  token: number;
  /** Presente quando o editor veio do "Capturar campo". */
  focus: CaptureFocus | null;
  /** Índice do grupo da gravação que originou o editor (volta ao painel ao fechar). */
  group: number | null;
}

export interface RecordingReviewState {
  groups: RecordingGroup[];
  handled: number[];
  /** Grupo único aberto direto no editor: ao fechar, não sobra painel. */
  direct: boolean;
}

/** Estado do editor de regra aberto na aba "Regras" (e sua relação com a revisão da gravação). */
export function useRuleEditor(
  config: Ref<Config>,
  loaded: Ref<boolean>,
  recording: Ref<RecordingReviewState | null>,
) {
  const editing = ref<Editing | null>(null);
  let token = 0;

  function open(
    draft: RuleDraft,
    baseUpdatedAt: string | null,
    focus: CaptureFocus | null = null,
    group: number | null = null,
  ): void {
    editing.value = { draft, baseUpdatedAt, token: ++token, focus, group };
  }

  function createRule(): void {
    open(newRuleDraft(), null);
  }

  function editRule(rule: Rule): void {
    open(ruleToDraft(rule), rule.updatedAt);
  }

  const externalChange = computed<'changed' | 'removed' | null>(() => {
    const e = editing.value;
    if (!e || e.draft.isNew) return null;
    const current = config.value.rules.find((r) => r.id === e.draft.id);
    if (!current) return loaded.value ? 'removed' : null;
    return current.updatedAt !== e.baseUpdatedAt ? 'changed' : null;
  });

  function reloadEditor(): void {
    const e = editing.value;
    if (!e) return;
    const current = config.value.rules.find((r) => r.id === e.draft.id);
    if (current) editRule(current);
  }

  /** Fecha o editor; se veio de uma gravação, marca o grupo como tratado (o painel reaparece). */
  function closeEditor(): void {
    const g = editing.value?.group ?? null;
    if (g !== null && recording.value) {
      if (recording.value.direct) recording.value = null;
      else if (!recording.value.handled.includes(g)) recording.value.handled.push(g);
    }
    editing.value = null;
  }

  return { editing, open, createRule, editRule, externalChange, reloadEditor, closeEditor };
}
