<script setup lang="ts">
import { computed } from 'vue';
import type { Rule } from '../../../core/model';
import { fieldCountLabel, groupRulesBySite, modeLabel } from '../composables/draft';

const props = defineProps<{ rules: Rule[]; loaded: boolean; missingIds: ReadonlySet<string> }>();
const emit = defineEmits<{
  create: [];
  edit: [rule: Rule];
  duplicate: [rule: Rule];
  remove: [rule: Rule];
  toggle: [rule: Rule, enabled: boolean];
  grant: [rule: Rule];
}>();

const groups = computed(() => groupRulesBySite(props.rules));

function onToggle(rule: Rule, ev: Event): void {
  emit('toggle', rule, (ev.target as HTMLInputElement).checked);
}
</script>

<template>
  <section aria-labelledby="rules-title">
    <div class="section-head">
      <h2 id="rules-title">Regras</h2>
      <button type="button" class="btn primary" data-testid="new-rule" @click="emit('create')">
        Nova regra
      </button>
    </div>

    <p v-if="!loaded" class="muted">Carregando…</p>
    <p v-else-if="rules.length === 0" class="empty">
      Você ainda não tem regras. Clique em “Nova regra” para criar a primeira.
    </p>

    <section v-for="g in groups" :key="g.site" class="group" :aria-label="`Site: ${g.site}`">
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
              <span v-if="missingIds.has(r.id)" class="no-permission" data-testid="no-permission">
                <span class="badge warn">sem permissão</span>
                <button
                  type="button"
                  class="btn small"
                  data-action="grant"
                  @click="emit('grant', r)"
                >
                  Permitir<span class="sr-only"> acesso para {{ r.name }}</span>
                </button>
              </span>
            </span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              role="switch"
              :checked="r.enabled"
              :aria-label="`Regra ativa: ${r.name}`"
              @change="onToggle(r, $event)"
            />
            <span class="switch-track" aria-hidden="true"></span>
            <span class="switch-text">{{ r.enabled ? 'Ligada' : 'Desligada' }}</span>
          </label>
          <div class="rule-actions">
            <button type="button" class="btn" data-action="edit" @click="emit('edit', r)">
              Editar<span class="sr-only"> {{ r.name }}</span>
            </button>
            <button type="button" class="btn" data-action="duplicate" @click="emit('duplicate', r)">
              Duplicar<span class="sr-only"> {{ r.name }}</span>
            </button>
            <button
              type="button"
              class="btn danger"
              data-action="remove"
              @click="emit('remove', r)"
            >
              Excluir<span class="sr-only"> {{ r.name }}</span>
            </button>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
