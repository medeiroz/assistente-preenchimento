<script setup lang="ts">
import { TABS, type TabId } from '../composables/tabs';

defineProps<{ active: TabId }>();
defineEmits<{ select: [id: TabId] }>();
</script>

<template>
  <div role="tablist" aria-label="Seções" class="tabs">
    <button
      v-for="t in TABS"
      :id="`tab-${t.id}`"
      :key="t.id"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="active === t.id"
      :aria-controls="`panel-${t.id}`"
      :tabindex="active === t.id ? 0 : -1"
      @click="$emit('select', t.id)"
    >
      {{ t.label }}
    </button>
  </div>
</template>
