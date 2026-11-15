<script setup lang="ts">
import type { PopupRule } from '../lib/frames';
import { modeLabel } from '../lib/outcome';

defineProps<{ rules: PopupRule[] }>();
</script>

<template>
  <section aria-labelledby="rules-h">
    <h2 id="rules-h">Regras nesta página</h2>
    <p v-if="rules.length === 0" class="muted">Nenhuma regra ativa nesta página.</p>
    <ul v-else class="rules" data-testid="rules">
      <li v-for="r in rules" :key="`${r.frameId}:${r.id}`">
        <span class="name">{{ r.name }}</span>
        <span v-if="r.frameId !== 0" class="muted" data-testid="rule-iframe">(iframe)</span>
        <span class="badge">{{ modeLabel(r.mode) }}</span>
      </li>
    </ul>
  </section>
</template>
