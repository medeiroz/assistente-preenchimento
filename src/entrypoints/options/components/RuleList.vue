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
      <h2 id="rules-title">Regras</h2>
      <button
        type="button"
        class="btn primary"
        data-testid="new-rule"
        :disabled="readOnly"
        @click="emit('create')"
      >
        Nova regra
      </button>
    </div>

    <p v-if="!loaded" class="muted">Carregando…</p>
    <div v-else-if="rules.length === 0" class="empty-state" data-testid="empty-state">
      <h3>Nenhuma regra ainda</h3>
      <p>
        Uma regra diz a um site quais campos preencher e com quais valores. Escolha por onde
        começar:
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
            Nova regra
          </button>
          <span class="hint">Descreva a página e os campos manualmente.</span>
        </li>
        <li data-testid="empty-capture">
          <strong>Capturar campo</strong>
          <span class="hint">
            Abra o site, clique no ícone da extensão na barra do Chrome e use “Capturar campo nesta
            página”; depois clique no campo desejado.
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
            Importar exemplo da Clínica Experts
          </button>
          <span class="hint">Uma regra pronta para usar de modelo; você pode editá-la depois.</span>
        </li>
      </ul>
    </div>

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
              <span
                v-if="classifyRule(r).insecure.length > 0"
                class="badge warn"
                data-testid="insecure-badge"
                title="Este site usa http: os valores preenchidos trafegam sem criptografia."
                >conexão não segura</span
              >
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
              :disabled="readOnly"
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
            <button
              type="button"
              class="btn"
              data-action="duplicate"
              :disabled="readOnly"
              @click="emit('duplicate', r)"
            >
              Duplicar<span class="sr-only"> {{ r.name }}</span>
            </button>
            <button
              type="button"
              class="btn danger"
              data-action="remove"
              :disabled="readOnly"
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
