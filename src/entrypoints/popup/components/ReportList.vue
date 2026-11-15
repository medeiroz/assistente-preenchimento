<script setup lang="ts">
import type { RunReport } from '../../../core/model';
import { formatSummary, outcomeIcon, outcomeLabel, outcomeTone } from '../lib/outcome';

defineProps<{ report: RunReport }>();
</script>

<template>
  <section aria-labelledby="rep-h">
    <h2 id="rep-h">{{ $t('popLastReport') }}</h2>
    <p class="muted" data-testid="report-rule">{{ report.ruleName }}</p>
    <p class="summary" data-testid="report-summary">{{ formatSummary(report) }}</p>
    <ul class="fields" data-testid="report-fields">
      <li v-for="f in report.fields" :key="f.fieldId" :class="`tone-${outcomeTone(f.outcome)}`">
        <span class="icon" aria-hidden="true">{{ outcomeIcon(f.outcome) }}</span>
        <span class="body">
          <span class="desc">{{ f.description }}</span>
          <span class="outcome" :data-outcome="f.outcome">{{ outcomeLabel(f.outcome) }}</span>
          <span v-if="f.message" class="msg">{{ f.message }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>
