<script setup lang="ts">
import { computed } from 'vue';
import type { Variable } from '../../../core/model';
import { fieldValueError } from '../composables/draft';
import { previewValue, type PreviewResult } from '../composables/preview';

const props = defineProps<{
  value: string;
  variables: readonly Variable[];
  exampleUrl: string;
}>();

// Erro de sintaxe já aparece no próprio campo; aqui não há resultado a mostrar.
const result = computed<PreviewResult>(() =>
  fieldValueError(props.value) !== null
    ? { kind: 'none' }
    : previewValue(props.value, { variables: props.variables, exampleUrl: props.exampleUrl }),
);
</script>

<template>
  <p v-if="result.kind === 'ok'" class="preview ok" data-testid="value-preview" aria-live="polite">
    {{ $t('previewResult') }}
    <span class="preview-value">{{ result.value === '' ? $t('emptyValue') : result.value }}</span>
  </p>
  <p
    v-else-if="result.kind === 'warn'"
    class="preview warn"
    data-testid="value-preview"
    aria-live="polite"
  >
    {{ $t('previewUnresolved', result.message) }}
  </p>
</template>
