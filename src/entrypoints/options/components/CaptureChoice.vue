<script setup lang="ts">
import type { Capture } from '../../../core/locator';
import type { Rule } from '../../../core/model';

defineProps<{ capture: Capture; rules: Rule[] }>();
defineEmits<{ addToRule: [rule: Rule]; newRule: []; dismiss: [] }>();
</script>

<template>
  <section class="notice" role="group" aria-label="Campo capturado" data-testid="capture-choice">
    <p>
      <strong>Campo capturado:</strong>
      {{ capture.label ?? 'campo sem rótulo' }}. Já existe uma regra para esta página e este
      contêiner. O que deseja fazer?
    </p>
    <div class="actions-bar">
      <button
        v-for="r in rules"
        :key="r.id"
        type="button"
        class="btn primary"
        data-testid="capture-add-to-rule"
        @click="$emit('addToRule', r)"
      >
        Adicionar à regra “{{ r.name }}”
      </button>
      <button type="button" class="btn" data-testid="capture-new-rule" @click="$emit('newRule')">
        Criar nova regra
      </button>
      <button type="button" class="btn" data-testid="capture-dismiss" @click="$emit('dismiss')">
        Descartar
      </button>
    </div>
  </section>
</template>
