<script setup lang="ts">
import { t } from '../../../core/i18n';
import { ref, watch } from 'vue';
import type { RunReport } from '../../../core/model';
import type { HistoryRepository } from '../../../core/storage';
import { OUTCOME_LABELS, formatDateTime, summaryText, urlHostPath } from '../composables/format';

const props = defineProps<{ repo: HistoryRepository; active: boolean }>();

const reports = ref<RunReport[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  try {
    reports.value = await props.repo.list();
    error.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

async function clear(): Promise<void> {
  if (!window.confirm(t('confirmClearHistory'))) return;
  try {
    await props.repo.clear();
    reports.value = [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

watch(
  () => props.active,
  (a) => {
    if (a) void load();
  },
  { immediate: true },
);
</script>

<template>
  <section aria-labelledby="history-title">
    <div class="section-head">
      <h2 id="history-title">{{ $t('tabHistory') }}</h2>
      <div class="row">
        <button type="button" class="btn" @click="load">{{ $t('histRefresh') }}</button>
        <button
          type="button"
          class="btn danger"
          :disabled="reports.length === 0"
          data-testid="clear-history"
          @click="clear"
        >
          {{ $t('histClear') }}
        </button>
      </div>
    </div>
    <p class="hint">
      {{ $t('histHint') }}
    </p>

    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="!loaded" class="muted">{{ $t('popLoading') }}</p>
    <p v-else-if="reports.length === 0" class="empty">{{ $t('histEmpty') }}</p>

    <ul class="history-list">
      <li v-for="(r, i) in reports" :key="`${r.startedAt}-${i}`" class="history-item">
        <div class="h-head">
          <span class="h-when">{{ formatDateTime(r.startedAt) }}</span>
          <span class="h-rule">{{ r.ruleName }}</span>
        </div>
        <p class="h-url" :title="r.url" data-testid="history-url">{{ urlHostPath(r.url) }}</p>
        <p class="h-summary" data-testid="history-summary">{{ summaryText(r) }}</p>
        <details class="h-details">
          <summary>{{ $t('histDetails') }}</summary>
          <p class="muted">
            {{ r.origin === 'auto' ? $t('histAuto') : $t('histManual') }}
          </p>
          <ul class="h-fields">
            <li v-for="f in r.fields" :key="f.fieldId" :class="`outcome-${f.outcome}`">
              <strong>{{ f.description }}</strong>
              <span>{{ OUTCOME_LABELS[f.outcome] }}</span>
              <span v-if="f.newValue !== undefined" class="muted">→ {{ f.newValue }}</span>
              <span v-if="f.message" class="muted">{{ f.message }}</span>
            </li>
          </ul>
        </details>
      </li>
    </ul>
  </section>
</template>
