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
import RecordingReview from './components/RecordingReview.vue';
import OptionsTabs from './components/OptionsTabs.vue';
import PermissionNotice from './components/PermissionNotice.vue';
import CaptureChoice from './components/CaptureChoice.vue';
import type { RecordingDraft } from '../../core/recorder/types';
import { exampleAddition } from './composables/example';
import { useNotice } from './composables/useNotice';
import { useRuleActions } from './composables/useRuleActions';
import { useRuleEditor, type RecordingReviewState } from './composables/useRuleEditor';
import { untilLoaded } from './composables/untilLoaded';
import { useConfig } from './composables/useConfig';
import { decideTabChange, type TabId } from './composables/tabs';
import { usePermissions } from './composables/permissions';
import {
  addCaptureToRule,
  findMatchingRules,
  newRuleFromCapture,
  usePickerDraft,
  type CaptureEditor,
} from './composables/picker';
import {
  findMatchingRulesForGroup,
  groupIntoRule,
  groupToNewRule,
  useRecordingDraft,
} from './composables/recording';

const tab = ref<TabId>('rules');
const { repo, config, loaded, loadError, readOnly, reload } = useConfig();
const historyRepo = chromeHistoryRepository();
const permissions = usePermissions(computed(() => config.value.rules));

const { notice, showNotice } = useNotice();

// ------------------------------------------------------------ editor
const recording = ref<RecordingReviewState | null>(null);
const { editing, open, createRule, editRule, externalChange, reloadEditor, closeEditor } =
  useRuleEditor(config, loaded, recording);
const editorRef = ref<InstanceType<typeof RuleEditor> | null>(null);

const existingIds = computed(() => config.value.rules.map((r) => r.id));

async function saveRule(rule: Rule): Promise<void> {
  // O pedido de permissão precisa começar dentro do gesto do usuário: antes de qualquer
  // await (inclusive do storage). A regra é salva de qualquer forma.
  const asking = permissions.request(rule);
  await repo.saveRule(rule);
  await reload();
  closeEditor();
  showNotice('ok', 'Regra salva');
  await asking;
}

async function saveVariables(variables: Variable[]): Promise<void> {
  await repo.saveVariables(variables);
  await reload();
  showNotice('ok', 'Variáveis salvas');
}

// ------------------------------------------------------------ ações da lista
const { toggleRule, copyRule, removeRule, addRules } = useRuleActions({
  repo,
  config,
  reload,
  permissions,
  showNotice,
  onAdded: () => (editing.value = null),
});

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

/** Chega um rascunho do "Capturar campo" (já apagado do storage: consumo único). */
async function onPicked(picked: PickerDraft): Promise<void> {
  await untilLoaded(loaded);
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

// ------------------------------------------------------------ gravação de preenchimento
function recordingNewRule(index: number): void {
  const group = recording.value?.groups[index];
  if (group) open(groupToNewRule(group), null, null, index);
}

function recordingAddToRule(index: number, rule: Rule): void {
  const group = recording.value?.groups[index];
  if (group) open(groupIntoRule(rule, group), rule.updatedAt, null, index);
}

/** Chega uma gravação (já apagada do storage: consumo único). */
async function onRecorded(rec: RecordingDraft): Promise<void> {
  await untilLoaded(loaded);
  if (editing.value && !window.confirm('Descartar a edição aberta e usar a gravação?')) return;
  tab.value = 'rules';
  editing.value = null;
  capturePrompt.value = null;
  recording.value = { groups: rec.groups, handled: [], direct: false };
  const only = rec.groups.length === 1 ? rec.groups[0] : undefined;
  if (only && findMatchingRulesForGroup(config.value.rules, only).length === 0) {
    recording.value.direct = true;
    recordingNewRule(0);
  }
}
useRecordingDraft(onRecorded);

function importExample(): void {
  const addition = exampleAddition();
  if (addition) void addRules(addition);
}

function onImported(): void {
  editing.value = null;
  void reload();
}

/** Troca de aba; com o editor aberto, fecha-o (confirmando antes se houver alterações). */
function selectTab(next: TabId): void {
  const decision = decideTabChange({
    editorOpen: editing.value !== null,
    dirty: editorRef.value?.dirty ?? false,
  });
  if (
    decision === 'confirm' &&
    !window.confirm('Você tem alterações não salvas nesta regra. Descartar e sair?')
  ) {
    return;
  }
  if (decision !== 'switch') closeEditor();
  tab.value = next;
}

watch(tab, () => (notice.value = null));
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>Assistente de Preenchimento — Configurações</h1>
    </header>

    <p
      v-if="readOnly"
      class="notice warn sticky-warning"
      role="alert"
      data-testid="read-only-warning"
    >
      Esta configuração foi salva por uma versão mais nova da extensão. Atualize a extensão para
      editar.
    </p>

    <OptionsTabs :active="tab" @select="selectTab" />

    <p v-if="notice" class="notice toast" :class="notice.kind" role="status" data-testid="notice">
      {{ notice.text }}
    </p>
    <p v-if="loadError" class="notice error" role="alert">
      Não foi possível carregar a configuração: {{ loadError }}
    </p>

    <PermissionNotice
      :notice="permissions.notice.value"
      @request="permissions.request"
      @dismiss="permissions.dismiss()"
    />

    <main>
      <div v-show="tab === 'rules'" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
        <CaptureChoice
          v-if="capturePrompt"
          :capture="capturePrompt.capture"
          :rules="capturePrompt.rules"
          @add-to-rule="(r) => captureToRule(r, capturePrompt!.capture)"
          @new-rule="captureToNewRule(capturePrompt.capture)"
          @dismiss="capturePrompt = null"
        />
        <RecordingReview
          v-if="recording && !editing"
          :groups="recording.groups"
          :rules="config.rules"
          :handled="recording.handled"
          @create="recordingNewRule"
          @add-to-rule="recordingAddToRule"
          @dismiss="recording = null"
        />
        <RuleEditor
          v-if="editing"
          ref="editorRef"
          :key="editing.token"
          :initial="editing.draft"
          :existing-ids="existingIds"
          :other-rules="config.rules"
          :variables="config.variables"
          :external-change="externalChange"
          :save="saveRule"
          :read-only="readOnly"
          :capture-focus="editing.focus"
          @cancel="closeEditor"
          @reload="reloadEditor"
        />
        <RuleList
          v-else-if="!capturePrompt && !recording"
          :rules="config.rules"
          :loaded="loaded"
          :missing-ids="permissions.missingRuleIds.value"
          :read-only="readOnly"
          @grant="permissions.request"
          @create="createRule"
          @import-example="importExample"
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
          :read-only="readOnly"
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
        <ImportExport
          :repo="repo"
          :read-only="readOnly"
          @imported="onImported"
          @add-rules="addRules"
        />
      </div>
    </main>
  </div>
</template>
