<script setup lang="ts">
import { computed } from 'vue';
import type { Rule } from '../../../core/model';
import { classifyRule } from '../../../shared/permissions';
import { fieldCountLabel, groupRulesBySite, modeLabel } from '../composables/draft';

const props = defineProps<{
  rules: Rule[];
  loaded: boolean;
  missingIds: ReadonlySet<string>;
  /** Configuração de versão mais nova: nada pode ser criado, alterado nem excluído. */
  readOnly?: boolean;
}>();
const emit = defineEmits<{
  create: [];
  edit: [rule: Rule];
  duplicate: [rule: Rule];
  remove: [rule: Rule];
  toggle: [rule: Rule, enabled: boolean];
  grant: [rule: Rule];
  importExample: [];
}>();

const groups = computed(() => groupRulesBySite(props.rules));

function onToggle(rule: Rule, ev: Event): void {
  emit('toggle', rule, (ev.target as HTMLInputElement).checked);
}
</script>

<template>
  <section aria-labelledby="rules-title">
    <div class="section-head">
      <h2 id="rules-title">{{ $t('tabRules') }}</h2>
      <button
        type="button"
        class="btn primary"
        data-testid="new-rule"
        :disabled="readOnly"
        @click="emit('create')"
      >
        {{ $t('newRule') }}
      </button>
    </div>

    <p v-if="!loaded" class="muted">{{ $t('popLoading') }}</p>
    <div v-else-if="rules.length === 0" class="empty-state" data-testid="empty-state">
      <h3>{{ $t('rlEmptyTitle') }}</h3>
      <p>
        {{ $t('rlIntro') }}
      </p>
      <ul class="empty-paths">
        <li>
          <button
            type="button"
            class="btn primary"
            data-testid="empty-new-rule"
            :disabled="readOnly"
            @click="emit('create')"
          >
            {{ $t('newRule') }}
          </button>
          <span class="hint">{{ $t('rlNewHint') }}</span>
        </li>
        <li data-testid="empty-capture">
          <strong>{{ $t('popCaptureField') }}</strong>
          <span class="hint">
            {{ $t('rlCaptureHint') }}
          </span>
        </li>
        <li>
          <button
            type="button"
            class="btn"
            data-testid="empty-import-example"
            :disabled="readOnly"
            @click="emit('importExample')"
          >
            {{ $t('rlImportExample') }}
          </button>
          <span class="hint">{{ $t('rlExampleHint') }}</span>
        </li>
      </ul>
    </div>

    <section v-for="g in groups" :key="g.site" class="group" :aria-label="$t('rlSiteAria', g.site)">
      <h3 class="group-title">{{ g.site }}</h3>
      <ul class="rule-list">
        <li v-for="r in g.rules" :key="r.id" class="rule-item" :data-rule-id="r.id">
          <div class="rule-main">
            <span class="rule-name">{{ r.name }}</span>
            <span class="rule-meta">
              <span class="badge" :class="`mode-${r.behavior.mode}`">{{
                modeLabel(r.behavior.mode)
              }}</span>
              <span>{{ fieldCountLabel(r.fields.length) }}</span>
              <span
                v-if="classifyRule(r).insecure.length > 0"
                class="badge warn"
                data-testid="insecure-badge"
                :title="$t('insecureTitle')"
                >{{ $t('insecureBadge') }}</span
              >
              <span v-if="missingIds.has(r.id)" class="no-permission" data-testid="no-permission">
                <span class="badge warn">{{ $t('noPermissionBadge') }}</span>
                <button
                  type="button"
                  class="btn small"
                  data-action="grant"
                  @click="emit('grant', r)"
                >
                  {{ $t('allow') }}<span class="sr-only"> {{ $t('allowAccessFor', r.name) }}</span>
                </button>
              </span>
            </span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              role="switch"
              :checked="r.enabled"
              :disabled="readOnly"
              :aria-label="$t('ruleActiveAria', r.name)"
              @change="onToggle(r, $event)"
            />
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-text">{{ r.enabled ? $t('ruleOn') : $t('ruleOff') }}</span>
          </label>
          <div class="rule-actions">
            <button type="button" class="btn" data-action="edit" @click="emit('edit', r)">
              {{ $t('edit') }}<span class="sr-only"> {{ r.name }}</span>
            </button>
            <button
              type="button"
              class="btn"
              data-action="duplicate"
              :disabled="readOnly"
              @click="emit('duplicate', r)"
            >
              {{ $t('duplicate') }}<span class="sr-only"> {{ r.name }}</span>
            </button>
            <button
              type="button"
              class="btn danger"
              data-action="remove"
              :disabled="readOnly"
              @click="emit('remove', r)"
            >
              {{ $t('delete') }}<span class="sr-only"> {{ r.name }}</span>
            </button>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
