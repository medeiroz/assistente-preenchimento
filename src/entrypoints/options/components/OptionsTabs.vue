<script setup lang="ts">
import { nextTick } from 'vue';
import { TABS, tabForKey, type TabId } from '../composables/tabs';

defineProps<{ active: TabId }>();
const emit = defineEmits<{ select: [id: TabId] }>();

/** Setas/Home/End movem o foco e a seleção (abas com ativação automática). */
function onKeydown(e: KeyboardEvent, id: TabId): void {
  const next = tabForKey(id, e.key);
  if (!next) return;
  e.preventDefault();
  emit('select', next);
  void nextTick(() => document.getElementById(`tab-${next}`)?.focus());
}
</script>

<template>
  <div role="tablist" :aria-label="$t('tabsAria')" class="tabs">
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
      @click="emit('select', t.id)"
      @keydown="onKeydown($event, t.id)"
    >
      {{ t.label }}
    </button>
  </div>
</template>
