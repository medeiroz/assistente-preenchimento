<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { chromeHistoryRepository } from '../../core/storage';
import type { Rule } from '../../core/model';
import RuleList from './components/RuleList.vue';
import RuleEditor from './components/RuleEditor.vue';
import HistoryView from './components/HistoryView.vue';
import ImportExport from './components/ImportExport.vue';
import { useConfig } from './composables/useConfig';
import { duplicateRule, newRuleDraft, ruleToDraft, type RuleDraft } from './composables/draft';

// Para incluir uma aba nova (ex.: Variáveis), acrescente aqui e um painel no template.
const TABS = [
  { id: 'rules', label: 'Regras' },
  { id: 'history', label: 'Histórico' },
  { id: 'import-export', label: 'Importar/Exportar' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tab = ref<TabId>('rules');
const { repo, config, loaded, loadError, reload } = useConfig();
const historyRepo = chromeHistoryRepository();

const notice = ref<{ kind: 'ok' | 'error'; text: string } | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function showNotice(kind: 'ok' | 'error', text: string): void {
  notice.value = { kind, text };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = null), 6000);
}

// ------------------------------------------------------------ editor
interface Editing {
  draft: RuleDraft;
  /** `updatedAt` da regra quando o editor abriu (null em regra nova). */
  baseUpdatedAt: string | null;
  /** Muda a cada abertura para recriar o componente. */
  token: number;
}
const editing = ref<Editing | null>(null);
let token = 0;

function open(draft: RuleDraft, baseUpdatedAt: string | null): void {
  editing.value = { draft, baseUpdatedAt, token: ++token };
}

function createRule(): void {
  open(newRuleDraft(), null);
}

function editRule(rule: Rule): void {
  open(ruleToDraft(rule), rule.updatedAt);
}

const externalChange = computed<'changed' | 'removed' | null>(() => {
  const e = editing.value;
  if (!e || e.draft.isNew) return null;
  const current = config.value.rules.find((r) => r.id === e.draft.id);
  if (!current) return loaded.value ? 'removed' : null;
  return current.updatedAt !== e.baseUpdatedAt ? 'changed' : null;
});

function reloadEditor(): void {
  const e = editing.value;
  if (!e) return;
  const current = config.value.rules.find((r) => r.id === e.draft.id);
  if (current) editRule(current);
}

const existingIds = computed(() => config.value.rules.map((r) => r.id));

async function saveRule(rule: Rule): Promise<void> {
  await repo.saveRule(rule);
  await reload();
  editing.value = null;
  showNotice('ok', 'Regra salva');
}

// ------------------------------------------------------------ ações da lista
async function guard(action: () => Promise<void>, failure: string): Promise<void> {
  try {
    await action();
  } catch (e) {
    showNotice('error', `${failure}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function toggleRule(rule: Rule, enabled: boolean): Promise<void> {
  return guard(async () => {
    await repo.saveRule({ ...rule, enabled });
    await reload();
  }, 'Não foi possível alterar a regra');
}

function copyRule(rule: Rule): Promise<void> {
  return guard(async () => {
    await repo.saveRule(duplicateRule(rule, config.value.rules));
    await reload();
    showNotice('ok', 'Regra duplicada');
  }, 'Não foi possível duplicar a regra');
}

function removeRule(rule: Rule): Promise<void> {
  if (!window.confirm(`Excluir a regra “${rule.name}”? Esta ação não pode ser desfeita.`)) {
    return Promise.resolve();
  }
  return guard(async () => {
    await repo.deleteRule(rule.id);
    await reload();
    showNotice('ok', 'Regra excluída');
  }, 'Não foi possível excluir a regra');
}

function onImported(): void {
  editing.value = null;
  void reload();
}

watch(tab, () => (notice.value = null));
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>Assistente de Preenchimento — Configurações</h1>
    </header>

    <div role="tablist" aria-label="Seções" class="tabs">
      <button
        v-for="t in TABS"
        :id="`tab-${t.id}`"
        :key="t.id"
        type="button"
        role="tab"
        class="tab"
        :aria-selected="tab === t.id"
        :aria-controls="`panel-${t.id}`"
        :tabindex="tab === t.id ? 0 : -1"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <p v-if="notice" class="notice toast" :class="notice.kind" role="status" data-testid="notice">
      {{ notice.text }}
    </p>
    <p v-if="loadError" class="notice error" role="alert">
      Não foi possível carregar a configuração: {{ loadError }}
    </p>

    <main>
      <div v-show="tab === 'rules'" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
        <RuleEditor
          v-if="editing"
          :key="editing.token"
          :initial="editing.draft"
          :existing-ids="existingIds"
          :external-change="externalChange"
          :save="saveRule"
          @cancel="editing = null"
          @reload="reloadEditor"
        />
        <RuleList
          v-else
          :rules="config.rules"
          :loaded="loaded"
          @create="createRule"
          @edit="editRule"
          @duplicate="copyRule"
          @remove="removeRule"
          @toggle="toggleRule"
        />
      </div>

      <div
        v-show="tab === 'history'"
        id="panel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
      >
        <HistoryView :repo="historyRepo" :active="tab === 'history'" />
      </div>

      <div
        v-show="tab === 'import-export'"
        id="panel-import-export"
        role="tabpanel"
        aria-labelledby="tab-import-export"
      >
        <ImportExport :repo="repo" @imported="onImported" />
      </div>
    </main>
  </div>
</template>
