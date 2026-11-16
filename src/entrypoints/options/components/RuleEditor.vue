<script setup lang="ts">
import { t } from '../../../core/i18n';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Rule, Variable } from '../../../core/model';
import { MAX_ITEM_BYTES, StorageQuotaError, measureRule } from '../../../core/storage';
import { draftToRuleInput } from '../composables/draftConvert';
import SizeMeter from './SizeMeter.vue';
import {
  MODE_OPTIONS,
  OVERWRITE_OPTIONS,
  cloneDraft,
  isDirty,
  validateDraft,
  type RuleDraft,
} from '../composables/draft';
import type { CaptureFocus } from '../composables/picker';
import { defaultExampleUrl, parseExampleUrl } from '../composables/preview';
import FieldTable from './FieldTable.vue';
import { overlappingRules } from '../../../core/engine/matcher';
import { classifyOrigins, hostOfOrigin } from '../../../shared/permissions';

const props = defineProps<{
  initial: RuleDraft;
  existingIds: string[];
  /** Regras salvas (para avisar de padrões de URL que se sobrepõem). */
  otherRules?: Rule[];
  /** Variáveis salvas (usadas na pré-visualização e nas sugestões). */
  variables: Variable[];
  /** A regra em edição mudou (ou sumiu) no armazenamento enquanto o editor estava aberto. */
  externalChange: 'changed' | 'removed' | null;
  save: (rule: Rule) => Promise<void>;
  /** Editor aberto a partir de "Capturar campo": campo a focar e dica do valor atual. */
  captureFocus?: CaptureFocus | null;
  /** Configuração de versão mais nova: a regra pode ser vista, mas não salva. */
  readOnly?: boolean;
}>();
const emit = defineEmits<{ cancel: []; reload: [] }>();

const draft = ref<RuleDraft>(cloneDraft(props.initial));
const attempted = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);
const errorBox = ref<HTMLElement | null>(null);

// Prévia estável (sem sorteio de id) para marcar erros ao vivo.
const live = computed(() => validateDraft(draft.value, { rng: () => 0.5 }));
const dirty = computed(() => isDirty(props.initial, draft.value));

// Tamanho que a regra terá no storage.sync: usa a regra validada; se o rascunho estiver
// inválido, mede o que a conversão produz; se nem isso der, esconde o medidor.
const ruleBytes = computed<number | null>(() => {
  try {
    return measureRule(live.value.rule ?? draftToRuleInput(draft.value, { rng: () => 0.5 }));
  } catch {
    return null;
  }
});
defineExpose({ dirty });

const shownErrors = computed<Record<string, string[]>>(() => {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(live.value.byKey)) {
    // erros de sintaxe do valor já aparecem ao vivo dentro da tabela
    if (k.endsWith('.value')) continue;
    // faixas de atraso/intervalo aparecem ao vivo; os demais só depois de tentar salvar
    const liveKey = k.endsWith('.delay') || k.endsWith('.keyDelay');
    if (!attempted.value && !liveKey) continue;
    out[k] = v;
  }
  return out;
});

// URL de exemplo da pré-visualização: padrão derivado do 1º padrão de URL até o usuário editar.
const exampleOverride = ref<string | null>(null);
const exampleUrl = computed({
  get: () => exampleOverride.value ?? defaultExampleUrl(draft.value.urlPatterns),
  set: (v: string) => (exampleOverride.value = v),
});
const exampleUrlInvalid = computed(() => parseExampleUrl(exampleUrl.value) === null);

const summaryMessages = computed(() => (attempted.value ? live.value.messages : []));

function err(key: string): string | null {
  const e = shownErrors.value[key];
  return e && e.length > 0 ? e.join('; ') : null;
}

// Avisos de permissão (não bloqueiam o salvamento).
const originClasses = computed(() => classifyOrigins(draft.value.urlPatterns));

const overlaps = computed(() =>
  overlappingRules(
    {
      id: draft.value.id,
      trigger: {
        urlPatterns: draft.value.urlPatterns.map((p) => p.trim()).filter((p) => p !== ''),
        settleMs: draft.value.settleMs,
      },
    },
    props.otherRules ?? [],
  ),
);

const priorityModel = computed<number | string>({
  get: () => draft.value.priority ?? '',
  set: (v) => {
    draft.value.priority = v === '' || v === null || Number.isNaN(Number(v)) ? null : Number(v);
  },
});

function patternError(i: number): string | null {
  return err(`urlPatterns.${i}`);
}

function addPattern(): void {
  draft.value.urlPatterns.push('');
}

function removePattern(i: number): void {
  if (draft.value.urlPatterns.length > 1) draft.value.urlPatterns.splice(i, 1);
  else draft.value.urlPatterns[0] = '';
}

function focusErrors(): void {
  void nextTick(() => errorBox.value?.focus());
}

async function submit(): Promise<void> {
  attempted.value = true;
  saveError.value = null;
  const result = validateDraft(draft.value, { existingIds: props.existingIds });
  if (!result.ok || !result.rule) {
    focusErrors();
    return;
  }
  saving.value = true;
  try {
    await props.save(result.rule);
  } catch (e) {
    saveError.value =
      e instanceof StorageQuotaError
        ? e.message
        : t('saveFailed', e instanceof Error ? e.message : String(e));
    focusErrors();
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (dirty.value && !window.confirm(t('confirmUnsaved'))) return;
  emit('cancel');
}

function beforeUnload(ev: BeforeUnloadEvent): void {
  if (dirty.value) ev.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <form class="editor" novalidate @submit.prevent="submit">
    <div class="section-head">
      <h2>{{ initial.isNew ? $t('newRule') : $t('editRule') }}</h2>
    </div>

    <div v-if="externalChange" class="notice warn" role="status" data-testid="external-change">
      <p>
        <strong>{{ $t('edChangedElsewhere') }}</strong>
        {{ externalChange === 'removed' ? $t('edRemovedExternally') : $t('edChangedExternally') }}
      </p>
      <button v-if="externalChange === 'changed'" type="button" class="btn" @click="emit('reload')">
        {{ $t('edDiscardReload') }}
      </button>
    </div>

    <div
      v-if="captureFocus?.duplicate"
      class="notice warn"
      role="status"
      data-testid="capture-duplicate"
    >
      <p>
        <strong>{{ $t('edDuplicateField') }}</strong>
        {{ $t('edDuplicateFieldNote') }}
      </p>
    </div>

    <div
      v-if="summaryMessages.length > 0 || saveError"
      ref="errorBox"
      class="notice error"
      role="alert"
      tabindex="-1"
      data-testid="error-summary"
    >
      <p v-if="saveError">
        <strong>{{ saveError }}</strong>
      </p>
      <template v-if="summaryMessages.length > 0">
        <p>
          <strong>{{ $t('edFixItems') }}</strong>
        </p>
        <ul>
          <li v-for="m in summaryMessages" :key="m">{{ m }}</li>
        </ul>
      </template>
    </div>

    <div class="control example-url">
      <label for="example-url">{{ $t('edExampleUrl') }}</label>
      <input
        id="example-url"
        v-model="exampleUrl"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="exampleUrlInvalid"
      />
      <p v-if="exampleUrlInvalid" class="error-text">
        {{ $t('edExampleUrlInvalid') }}
      </p>
    </div>

    <fieldset class="panel">
      <legend>{{ $t('edIdentification') }}</legend>
      <div class="control">
        <label for="rule-name">{{ $t('valWhereName') }}</label>
        <input
          id="rule-name"
          v-model="draft.name"
          type="text"
          autocomplete="off"
          :aria-invalid="err('name') !== null"
          :aria-describedby="err('name') ? 'rule-name-err' : undefined"
          :placeholder="$t('edNamePlaceholder')"
        />
        <p v-if="err('name')" id="rule-name-err" class="error-text">{{ err('name') }}</p>
      </div>
    </fieldset>

    <fieldset class="panel">
      <legend>{{ $t('edWhere') }}</legend>
      <p class="hint">
        {{ $t('edUrlHintA') }} <code>https://site.com/*</code> {{ $t('edUrlHintB') }} <code>*</code>
        {{ $t('edUrlHintC') }}
      </p>
      <div v-for="(_, i) in draft.urlPatterns" :key="i" class="control pattern-row">
        <label :for="`url-${i}`">{{ $t('valWhereUrlPattern', i + 1) }}</label>
        <div class="row">
          <input
            :id="`url-${i}`"
            v-model="draft.urlPatterns[i]"
            class="url-pattern"
            type="text"
            autocomplete="off"
            placeholder="https://site.com/*"
            :aria-invalid="patternError(i) !== null"
            :aria-describedby="patternError(i) ? `url-${i}-err` : undefined"
          />
          <button
            type="button"
            class="btn small danger"
            :aria-label="$t('edRemovePatternAria', i + 1)"
            @click="removePattern(i)"
          >
            {{ $t('remove') }}
          </button>
        </div>
        <p v-if="patternError(i)" :id="`url-${i}-err`" class="error-text">{{ patternError(i) }}</p>
      </div>
      <p v-if="err('urlPatterns')" class="error-text">{{ err('urlPatterns') }}</p>
      <p v-if="originClasses.insecure.length > 0" class="hint warn-text" data-testid="warn-http">
        {{ $t('edInsecure', originClasses.insecure.map(hostOfOrigin).join(', ')) }}
      </p>
      <p v-if="originClasses.broad.length > 0" class="hint warn-text" data-testid="warn-broad">
        {{ $t('edBroad') }}
      </p>
      <p v-if="originClasses.needed.length > 0" class="hint" data-testid="info-permission">
        {{ $t('edNeedsPermission', originClasses.needed.map(hostOfOrigin).join(', ')) }}
      </p>
      <p v-if="overlaps.length > 0" class="hint warn-text" data-testid="warn-overlap">
        {{ $t('edOverlap', overlaps.map((r) => r.name).join(', ')) }}
      </p>
      <button type="button" class="btn" @click="addPattern">
        {{ $t('edAddPattern') }}
      </button>

      <div class="control">
        <label class="inline" for="all-frames">
          <input id="all-frames" v-model="draft.allFrames" type="checkbox" />
          <span>{{ $t('edAllFrames') }}</span>
        </label>
        <p v-if="draft.allFrames" class="hint" data-testid="info-frames">
          {{ $t('edFramesOn') }}
        </p>
        <p v-else class="hint">
          {{ $t('edFramesOff') }}
        </p>
      </div>

      <div class="control">
        <label for="container-selector">{{ $t('edContainerSelector') }}</label>
        <input
          id="container-selector"
          v-model="draft.containerSelector"
          type="text"
          autocomplete="off"
          placeholder=".modal.is-active"
          :aria-invalid="err('container') !== null"
        />
      </div>
      <div class="control">
        <label for="container-text">{{ $t('edContainerText') }}</label>
        <input
          id="container-text"
          v-model="draft.containerText"
          type="text"
          autocomplete="off"
          :placeholder="$t('edContainerTextPlaceholder')"
        />
        <p class="hint">
          {{ $t('edContainerHint') }}
        </p>
        <p v-if="err('container')" class="error-text">{{ err('container') }}</p>
      </div>

      <details class="advanced">
        <summary>{{ $t('edAdvWait') }}</summary>
        <div class="control">
          <label for="settle">{{ $t('edSettleLabel') }}</label>
          <input
            id="settle"
            v-model.number="draft.settleMs"
            type="number"
            min="0"
            max="10000"
            step="50"
            :aria-invalid="err('settleMs') !== null"
          />
          <p class="hint">
            {{ $t('edSettleHint') }}
          </p>
          <p v-if="err('settleMs')" class="error-text">{{ err('settleMs') }}</p>
        </div>
      </details>
    </fieldset>

    <fieldset class="panel">
      <legend>{{ $t('edBehavior') }}</legend>
      <div class="radio-group" role="radiogroup" aria-labelledby="mode-label">
        <p id="mode-label" class="group-label">{{ $t('edWhen') }}</p>
        <label v-for="o in MODE_OPTIONS" :key="o.id" class="radio">
          <input v-model="draft.mode" type="radio" name="mode" :value="o.id" />
          <span>
            <strong>{{ o.label }}</strong>
            <small>{{ o.description }}</small>
          </span>
        </label>
      </div>
      <div class="radio-group" role="radiogroup" aria-labelledby="overwrite-label">
        <p id="overwrite-label" class="group-label">{{ $t('edOverwrite') }}</p>
        <label v-for="o in OVERWRITE_OPTIONS" :key="o.id" class="radio">
          <input v-model="draft.overwrite" type="radio" name="overwrite" :value="o.id" />
          <span>
            <strong>{{ o.label }}</strong>
            <small>{{ o.description }}</small>
          </span>
        </label>
      </div>
      <details class="advanced">
        <summary>{{ $t('edAdvPriority') }}</summary>
        <div class="control">
          <label for="priority">{{ $t('edPriorityLabel') }}</label>
          <input
            id="priority"
            v-model="priorityModel"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="50"
            :aria-invalid="err('priority') !== null"
          />
          <p class="hint">
            {{ $t('edPriorityHint') }}
          </p>
          <p v-if="err('priority')" class="error-text">{{ err('priority') }}</p>
        </div>
      </details>
    </fieldset>

    <FieldTable
      v-model:fields="draft.fields"
      :errors="shownErrors"
      :variables="variables"
      :example-url="exampleUrl"
      :focus-field-id="captureFocus?.fieldId ?? null"
      :hints="captureFocus ? { [captureFocus.fieldId]: captureFocus.hint } : {}"
    />
    <p v-if="err('fields')" class="error-text">{{ err('fields') }}</p>

    <SizeMeter
      v-if="ruleBytes !== null"
      :bytes="ruleBytes"
      :limit="MAX_ITEM_BYTES"
      :over-message="$t('sizeOverFields')"
    />

    <div class="actions-bar">
      <button
        type="submit"
        class="btn primary"
        :disabled="saving || readOnly"
        data-testid="save-rule"
      >
        {{ saving ? $t('saving') : $t('save') }}
      </button>
      <button type="button" class="btn" data-testid="cancel-edit" @click="cancel">
        {{ $t('cancel') }}
      </button>
      <span v-if="dirty" class="muted">{{ $t('unsavedChanges') }}</span>
    </div>
  </form>
</template>
