<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { chromeHistoryRepository } from '../../core/storage';
import type { Rule, Variable } from '../../core/model';
import type { Capture, PickerDraft } from '../../core/locator';
import RuleList from './components/RuleList.vue';
import RuleEditor from './components/RuleEditor.vue';
import HistoryView from './components/HistoryView.vue';
import VariablesView from './components/VariablesView.vue';
import ImportExport from './components/ImportExport.vue';
import { useConfig } from './composables/useConfig';
import { usePermissions } from './composables/permissions';
import { duplicateRule, newRuleDraft, ruleToDraft, type RuleDraft } from './composables/draft';
import {
  addCaptureToRule,
  findMatchingRules,
  newRuleFromCapture,
  usePickerDraft,
  type CaptureEditor,
  type CaptureFocus,
} from './composables/picker';

// Para incluir uma aba nova (ex.: Variáveis), acrescente aqui e um painel no template.
const TABS = [
  { id: 'rules', label: 'Regras' },
  { id: 'variables', label: 'Variáveis' },
  { id: 'history', label: 'Histórico' },
  { id: 'import-export', label: 'Importar/Exportar' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tab = ref<TabId>('rules');
const { repo, config, loaded, loadError, reload } = useConfig();
const historyRepo = chromeHistoryRepository();
const permissions = usePermissions(computed(() => config.value.rules));

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
  /** Presente quando o editor veio do "Capturar campo". */
  focus: CaptureFocus | null;
}
const editing = ref<Editing | null>(null);
let token = 0;

function open(
  draft: RuleDraft,
  baseUpdatedAt: string | null,
  focus: CaptureFocus | null = null,
): void {
  editing.value = { draft, baseUpdatedAt, token: ++token, focus };
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
  // O pedido de permissão precisa começar dentro do gesto do usuário: antes de qualquer
  // await (inclusive do storage). A regra é salva de qualquer forma.
  const asking = permissions.request(rule);
  await repo.saveRule(rule);
  await reload();
  editing.value = null;
  showNotice('ok', 'Regra salva');
  await asking;
}

async function saveVariables(variables: Variable[]): Promise<void> {
  await repo.saveVariables(variables);
  await reload();
  showNotice('ok', 'Variáveis salvas');
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

// ------------------------------------------------------------ captura de campo
interface CapturePrompt {
  capture: Capture;
  rules: Rule[];
}
const capturePrompt = ref<CapturePrompt | null>(null);

function openCaptureEditor(editor: CaptureEditor, baseUpdatedAt: string | null): void {
  capturePrompt.value = null;
  open(editor.draft, baseUpdatedAt, editor.focus);
}

function captureToNewRule(capture: Capture): void {
  openCaptureEditor(newRuleFromCapture(capture), null);
}

function captureToRule(rule: Rule, capture: Capture): void {
  openCaptureEditor(addCaptureToRule(rule, capture), rule.updatedAt);
}

function untilLoaded(): Promise<void> {
  if (loaded.value) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(loaded, (v) => {
      if (!v) return;
      stop();
      resolve();
    });
  });
}

/** Chega um rascunho do "Capturar campo" (já apagado do storage: consumo único). */
async function onPicked(picked: PickerDraft): Promise<void> {
  await untilLoaded();
  if (editing.value && !window.confirm('Descartar a edição aberta e usar o campo capturado?')) {
    return;
  }
  tab.value = 'rules';
  editing.value = null;
  const matches = findMatchingRules(config.value.rules, picked.capture);
  if (matches.length === 0) captureToNewRule(picked.capture);
  else capturePrompt.value = { capture: picked.capture, rules: matches };
}
usePickerDraft(onPicked);

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

    <div
      v-if="permissions.notice.value?.kind === 'denied'"
      class="notice warn"
      role="status"
      data-testid="perm-denied"
    >
      <p>
        <strong>Sem permissão para {{ permissions.notice.value.hosts.join(', ') }}:</strong>
        a regra fica salva, mas só funciona depois que você permitir o acesso.
      </p>
      <button
        type="button"
        class="btn"
        data-testid="perm-allow"
        @click="permissions.notice.value.rule && permissions.request(permissions.notice.value.rule)"
      >
        Permitir acesso
      </button>
    </div>
    <div
      v-else-if="permissions.notice.value?.kind === 'granted'"
      class="notice ok"
      role="status"
      data-testid="perm-granted"
    >
      <p>Recarregue as abas abertas desse site para a extensão começar a atuar.</p>
      <button type="button" class="btn" @click="permissions.dismiss()">Entendi</button>
    </div>

    <main>
      <div v-show="tab === 'rules'" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
        <section
          v-if="capturePrompt"
          class="notice"
          role="group"
          aria-label="Campo capturado"
          data-testid="capture-choice"
        >
          <p>
            <strong>Campo capturado:</strong>
            {{ capturePrompt.capture.label ?? 'campo sem rótulo' }}. Já existe uma regra para esta
            página e este contêiner. O que deseja fazer?
          </p>
          <div class="actions-bar">
            <button
              v-for="r in capturePrompt.rules"
              :key="r.id"
              type="button"
              class="btn primary"
              data-testid="capture-add-to-rule"
              @click="captureToRule(r, capturePrompt.capture)"
            >
              Adicionar à regra “{{ r.name }}”
            </button>
            <button
              type="button"
              class="btn"
              data-testid="capture-new-rule"
              @click="captureToNewRule(capturePrompt.capture)"
            >
              Criar nova regra
            </button>
            <button
              type="button"
              class="btn"
              data-testid="capture-dismiss"
              @click="capturePrompt = null"
            >
              Descartar
            </button>
          </div>
        </section>
        <RuleEditor
          v-if="editing"
          :key="editing.token"
          :initial="editing.draft"
          :existing-ids="existingIds"
          :variables="config.variables"
          :external-change="externalChange"
          :save="saveRule"
          :capture-focus="editing.focus"
          @cancel="editing = null"
          @reload="reloadEditor"
        />
        <RuleList
          v-else-if="!capturePrompt"
          :rules="config.rules"
          :loaded="loaded"
          :missing-ids="permissions.missingRuleIds.value"
          @grant="permissions.request"
          @create="createRule"
          @edit="editRule"
          @duplicate="copyRule"
          @remove="removeRule"
          @toggle="toggleRule"
        />
      </div>

      <div
        v-show="tab === 'variables'"
        id="panel-variables"
        role="tabpanel"
        aria-labelledby="tab-variables"
      >
        <VariablesView
          :variables="config.variables"
          :rules="config.rules"
          :loaded="loaded"
          :save="saveVariables"
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
