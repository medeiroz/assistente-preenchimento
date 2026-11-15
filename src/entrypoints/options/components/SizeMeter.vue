<script setup lang="ts">
import { computed } from 'vue';
import { sizeLabel, sizeLevel } from '../composables/sizeMeter';

const props = defineProps<{
  bytes: number;
  limit: number;
  /** Texto mostrado depois de "Acima do limite: " quando o tamanho passa do limite. */
  overMessage: string;
}>();

const level = computed(() => sizeLevel(props.bytes, props.limit));
const label = computed(() => sizeLabel(props.bytes, props.limit));
const percent = computed(() => Math.min(100, Math.round((props.bytes / props.limit) * 100)));
</script>

<template>
  <div class="size-meter" :class="`level-${level}`" data-testid="size-meter" :data-level="level">
    <div class="size-meter-head">
      <span>Tamanho para sincronizar</span>
      <strong data-testid="size-meter-text">{{ label }}</strong>
    </div>
    <div
      class="size-meter-track"
      role="meter"
      aria-label="Tamanho para sincronizar"
      aria-valuemin="0"
      :aria-valuemax="limit"
      :aria-valuenow="Math.min(bytes, limit)"
      :aria-valuetext="label"
    >
      <div class="size-meter-bar" :style="{ width: `${percent}%` }"></div>
    </div>
    <p v-if="level === 'error'" class="error-text" data-testid="size-meter-error">
      Acima do limite: {{ overMessage }}
    </p>
  </div>
</template>
