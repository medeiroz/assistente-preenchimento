<script setup lang="ts">
import RecordingStarting from './RecordingStarting.vue';
import RecordingStatus from './RecordingStatus.vue';

defineProps<{
  recording: { active: boolean; count: number };
  busy: boolean;
  starting: boolean;
  awaitingPermission: boolean;
  error: string;
}>();
defineEmits<{
  recordStart: [];
  recordStop: [discard: boolean];
  capture: [];
  openSettings: [];
}>();
</script>

<template>
  <section class="empty" data-testid="unavailable">
    <p>Nenhuma regra para este site</p>
    <p class="muted">
      Para criar uma regra, grave o preenchimento do formulário ou capture um campo desta página. A
      extensão só acessa a página depois do seu clique.
    </p>
    <RecordingStatus
      v-if="recording.active"
      :count="recording.count"
      :busy="busy"
      @stop="$emit('recordStop', false)"
      @discard="$emit('recordStop', true)"
    />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <RecordingStarting v-if="starting" :awaiting-permission="awaitingPermission" />
    <div v-else class="actions">
      <button
        v-if="!recording.active"
        type="button"
        class="btn primary"
        data-testid="record-start"
        :disabled="busy"
        @click="$emit('recordStart')"
      >
        Gravar preenchimento
      </button>
      <button
        type="button"
        class="btn"
        data-testid="capture-here"
        :disabled="busy"
        @click="$emit('capture')"
      >
        Capturar campo nesta página
      </button>
      <button type="button" class="btn" @click="$emit('openSettings')">Abrir configurações</button>
    </div>
  </section>
</template>
