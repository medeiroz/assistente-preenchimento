<script setup lang="ts">
import type { Capture } from '../../../core/locator';
import type { Rule } from '../../../core/model';

defineProps<{ capture: Capture; rules: Rule[] }>();
defineEmits<{ addToRule: [rule: Rule]; newRule: []; dismiss: [] }>();
</script>

<template>
  <section
    class="notice"
    role="group"
    :aria-label="$t('capChoiceAria')"
    data-testid="capture-choice"
  >
    <p>
      <strong>{{ $t('capCaptured') }}</strong>
      {{ capture.label ?? $t('fieldNoLabelLower') }}. {{ $t('capChoiceQuestion') }}
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
        {{ $t('addToRule', r.name) }}
      </button>
      <button type="button" class="btn" data-testid="capture-new-rule" @click="$emit('newRule')">
        {{ $t('capNewRule') }}
      </button>
      <button type="button" class="btn" data-testid="capture-dismiss" @click="$emit('dismiss')">
        {{ $t('barDiscard') }}
      </button>
    </div>
  </section>
</template>
