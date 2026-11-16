<script setup lang="ts">
import { computed } from 'vue';
import type { Rule } from '../../../core/model';
import type { RecordingGroup } from '../../../core/recorder/types';
import { findMatchingRulesForGroup, recordedLabel } from '../composables/recording';
import { suggestRuleName } from '../composables/picker';
import { groupCapture } from '../composables/recording';

const props = defineProps<{
  groups: RecordingGroup[];
  rules: Rule[];
  /** Índices dos grupos que já foram abertos no editor (salvos ou cancelados). */
  handled: number[];
}>();
const emit = defineEmits<{
  create: [index: number];
  addToRule: [index: number, rule: Rule];
  dismiss: [];
}>();

const cards = computed(() =>
  props.groups.map((group, index) => ({
    group,
    index,
    name: suggestRuleName(groupCapture(group)),
    matches: findMatchingRulesForGroup(props.rules, group),
    done: props.handled.includes(index),
  })),
);
</script>

<template>
  <section
    class="notice"
    role="group"
    :aria-label="$t('recReviewAria')"
    data-testid="recording-review"
  >
    <p>
      <strong>{{ $t('recReviewTitle', groups.length) }}</strong>
    </p>
    <div v-for="c in cards" :key="c.index" class="recording-card" :class="{ done: c.done }">
      <h3>
        {{ c.name }}
        <span v-if="c.done" class="muted" data-testid="recording-done">
          {{ $t('recDone') }}
        </span>
      </h3>
      <p class="muted">{{ c.group.urlPattern }}</p>
      <p v-if="c.group.container?.textContains" class="muted">
        {{ $t('recContainer', c.group.container.textContains) }}
      </p>
      <ul class="recording-fields">
        <li v-for="(f, i) in c.group.fields" :key="i">
          <strong>{{ recordedLabel(f) }}</strong> → <code>{{ f.value }}</code>
        </li>
      </ul>
      <div class="actions-bar">
        <button
          type="button"
          class="btn primary"
          data-testid="recording-new-rule"
          @click="emit('create', c.index)"
        >
          {{ $t('recCreateRule') }}
        </button>
        <button
          v-for="r in c.matches"
          :key="r.id"
          type="button"
          class="btn"
          data-testid="recording-add-to-rule"
          @click="emit('addToRule', c.index, r)"
        >
          {{ $t('addToRule', r.name) }}
        </button>
      </div>
    </div>
    <div class="actions-bar">
      <button type="button" class="btn" data-testid="recording-dismiss" @click="emit('dismiss')">
        {{ $t('close') }}
      </button>
    </div>
  </section>
</template>
