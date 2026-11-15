<script setup lang="ts">
defineProps<{ count: number; busy: boolean }>();
defineEmits<{ stop: []; discard: [] }>();
</script>

<template>
  <section class="recording" data-testid="record-status">
    <p class="summary">Gravando preenchimento · {{ count }} campo(s)</p>
    <div class="actions">
      <button
        type="button"
        class="btn primary"
        data-testid="record-stop"
        :disabled="busy"
        @click="$emit('stop')"
      >
        Parar e criar regras
      </button>
      <button
        type="button"
        class="btn"
        data-testid="record-discard"
        :disabled="busy"
        @click="$emit('discard')"
      >
        Descartar
      </button>
    </div>
  </section>
</template>
