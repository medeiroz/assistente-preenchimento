<script setup lang="ts">
defineProps<{ count: number; busy: boolean }>();
defineEmits<{ stop: []; discard: [] }>();
</script>

<template>
  <section class="recording" data-testid="record-status">
    <p class="summary">{{ $t('popRecording', count) }}</p>
    <div class="actions">
      <button
        type="button"
        class="btn primary"
        data-testid="record-stop"
        :disabled="busy"
        @click="$emit('stop')"
      >
        {{ $t('barStop') }}
      </button>
      <button
        type="button"
        class="btn"
        data-testid="record-discard"
        :disabled="busy"
        @click="$emit('discard')"
      >
        {{ $t('barDiscard') }}
      </button>
    </div>
  </section>
</template>
