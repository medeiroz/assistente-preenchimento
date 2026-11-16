<script setup lang="ts">
import { t } from '../../../core/i18n';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Config, Rule } from '../../../core/model';
import { SYNC_QUOTA_BYTES, measureConfig, type ConfigRepository } from '../../../core/storage';
import { formatKb, formatLimit, sizeLevel } from '../composables/sizeMeter';
import { exportFileName, exportJson, parseImport } from '../composables/format';
import { parseAddition, planMerge, type Addition, type MergePlan } from '../composables/merge';
import { hostOfPattern } from '../composables/draft';

const props = defineProps<{ repo: ConfigRepository; readOnly?: boolean }>();
const rulesLabel = (n: number): string => (n === 1 ? t('countRuleOne') : t('countRuleMany', n));
const variablesLabel = (n: number): string => (n === 1 ? t('countVarOne') : t('countVarMany', n));
const emit = defineEmits<{ imported: []; addRules: [addition: Addition] }>();

const error = ref<string | null>(null);
const message = ref<string | null>(null);
const preview = ref<{ config: Config; warnings: string[]; fileName: string } | null>(null);
const busy = ref(false);
const includeLocal = ref(false);
const addError = ref<string | null>(null);
const addPreview = ref<{ addition: Addition; plan: MergePlan; fileName: string } | null>(null);
const addInput = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// Uso total do storage.sync, somando os itens que a configuração ocupa; acompanha mudanças.
const usageBytes = ref<number | null>(null);
async function refreshUsage(): Promise<void> {
  try {
    usageBytes.value = measureConfig(await props.repo.load());
  } catch {
    usageBytes.value = null;
  }
}
let offChange: (() => void) | undefined;
onMounted(() => {
  void refreshUsage();
  offChange = props.repo.onChange(() => void refreshUsage());
});
onBeforeUnmount(() => offChange?.());

async function doExport(): Promise<void> {
  error.value = null;
  message.value = null;
  try {
    const config = await props.repo.load();
    const blob = new Blob([exportJson(config, { includeLocalValues: includeLocal.value })], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(new Date());
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    message.value = t('ieFileGenerated', a.download);
  } catch (e) {
    error.value = t('ieExportFailed', e instanceof Error ? e.message : String(e));
  }
}

async function onFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  error.value = null;
  message.value = null;
  preview.value = null;
  if (!file) return;
  const parsed = parseImport(await file.text());
  if (!parsed.ok) {
    error.value = parsed.error;
  } else {
    preview.value = { config: parsed.config, warnings: parsed.warnings, fileName: file.name };
  }
  input.value = '';
}

async function confirmImport(): Promise<void> {
  if (!preview.value) return;
  busy.value = true;
  try {
    await props.repo.replaceAll(preview.value.config);
    message.value = t('ieImported');
    preview.value = null;
    emit('imported');
  } catch (e) {
    error.value = t('ieImportFailed', e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = false;
  }
}

function sitesOf(rule: Rule): string {
  return rule.trigger.urlPatterns.map((p) => hostOfPattern(p) ?? p).join(', ');
}

async function onAddFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  addError.value = null;
  addPreview.value = null;
  if (!file) return;
  const parsed = parseAddition(await file.text());
  if (!parsed.ok) {
    addError.value = parsed.error;
  } else {
    try {
      const plan = planMerge(await props.repo.load(), parsed.addition);
      addPreview.value = { addition: parsed.addition, plan, fileName: file.name };
    } catch (e) {
      addError.value = t('ieReadCurrentFailed', e instanceof Error ? e.message : String(e));
    }
  }
  input.value = '';
}

/** Síncrono de propósito: o pedido de permissão do pai precisa começar dentro deste clique. */
function confirmAdd(): void {
  const p = addPreview.value;
  if (!p) return;
  addPreview.value = null;
  emit('addRules', p.addition);
}

function cancelAdd(): void {
  addPreview.value = null;
  if (addInput.value) addInput.value.value = '';
}

function cancelImport(): void {
  preview.value = null;
  if (fileInput.value) fileInput.value.value = '';
}
</script>

<template>
  <section aria-labelledby="ie-title">
    <div class="section-head">
      <h2 id="ie-title">{{ $t('tabImportExport') }}</h2>
    </div>

    <p
      v-if="usageBytes !== null"
      class="hint"
      :class="{ 'warn-text': sizeLevel(usageBytes, SYNC_QUOTA_BYTES) !== 'ok' }"
      data-testid="sync-usage"
    >
      {{ $t('ieTotalUsage', formatKb(usageBytes), formatLimit(SYNC_QUOTA_BYTES)) }}
    </p>

    <div class="panel">
      <h3>{{ $t('ieExportTitle') }}</h3>
      <p class="hint">
        {{ $t('ieExportHint') }}
      </p>
      <label class="check">
        <input v-model="includeLocal" type="checkbox" data-testid="export-include-local" />
        {{ $t('ieIncludeLocal') }}
      </label>
      <p v-if="includeLocal" class="notice warn" data-testid="export-local-warning">
        {{ $t('ieLocalWarning') }}
      </p>
      <button type="button" class="btn primary" data-testid="export" @click="doExport">
        {{ $t('ieExportButton') }}
      </button>
    </div>

    <div class="panel" data-testid="add-panel">
      <h3>{{ $t('ieAddTitle') }}</h3>
      <p class="hint">
        {{ $t('ieAddHintA') }} <strong>{{ $t('ieAddHintB') }}</strong> {{ $t('ieAddHintC') }}
        <code>presets/exemplo-cadastro.json</code>) {{ $t('ieAddHintD') }}
        <strong>{{ $t('ieAddHintE') }}</strong> {{ $t('ieAddHintF') }}
      </p>
      <label for="add-file" class="block-label">{{ $t('ieAddFileLabel') }}</label>
      <input
        id="add-file"
        ref="addInput"
        class="file-input"
        type="file"
        accept="application/json,.json"
        data-testid="add-file"
        :disabled="readOnly"
        @change="onAddFile"
      />

      <div v-if="addPreview" class="notice" role="status" data-testid="add-preview">
        <p>
          <strong>{{ addPreview.fileName }}</strong>
          {{ $t('ieWillAdd', rulesLabel(addPreview.plan.rules.length)) }}
        </p>
        <ul>
          <li v-for="r in addPreview.plan.rules" :key="r.id">
            {{ r.name }} <span class="muted">({{ sitesOf(r) }})</span>
          </li>
        </ul>
        <p v-if="addPreview.plan.renamed.length > 0" data-testid="add-renamed">
          {{ addPreview.plan.renamed.length === 1 ? $t('ieRenamedOne') : $t('ieRenamedMany') }}
        </p>
        <p v-if="addPreview.plan.newVariables.length > 0">
          {{ $t('ieNewVars', addPreview.plan.newVariables.map((v) => v.key).join(', ')) }}
        </p>
        <p v-if="addPreview.plan.skippedVariables.length > 0">
          {{ $t('ieKeptVars', addPreview.plan.skippedVariables.join(', ')) }}
        </p>
        <template v-if="addPreview.addition.warnings.length > 0">
          <p>{{ $t('ieWarnings') }}</p>
          <ul>
            <li v-for="w in addPreview.addition.warnings" :key="w">{{ w }}</li>
          </ul>
        </template>
        <p class="hint">
          {{ $t('ieNewSitesHint') }}
        </p>
        <div class="row">
          <button
            type="button"
            class="btn primary"
            data-testid="confirm-add"
            :disabled="readOnly"
            @click="confirmAdd"
          >
            {{ $t('ieAddConfirm') }}
          </button>
          <button type="button" class="btn" @click="cancelAdd">
            {{ $t('cancel') }}
          </button>
        </div>
      </div>
      <p v-if="addError" class="notice error" role="alert" data-testid="add-error">
        {{ addError }}
      </p>
    </div>

    <div class="panel">
      <h3>{{ $t('ieImportTitle') }}</h3>
      <p class="hint">
        {{ $t('ieImportHintA') }} <strong>{{ $t('ieImportHintB') }}</strong>
        {{ $t('ieImportHintC') }}
      </p>
      <label for="import-file" class="block-label">{{ $t('ieImportFileLabel') }}</label>
      <input
        id="import-file"
        ref="fileInput"
        class="file-input"
        type="file"
        accept="application/json,.json"
        data-testid="import-file"
        :disabled="readOnly"
        @change="onFile"
      />

      <div v-if="preview" class="notice" role="status" data-testid="import-preview">
        <p>
          <strong>{{ preview.fileName }}</strong>:
          {{
            $t(
              'ieImportCounts',
              rulesLabel(preview.config.rules.length),
              variablesLabel(preview.config.variables.length),
            )
          }}
        </p>
        <template v-if="preview.warnings.length > 0">
          <p>{{ $t('ieWarnings') }}</p>
          <ul>
            <li v-for="w in preview.warnings" :key="w">{{ w }}</li>
          </ul>
        </template>
        <div class="row">
          <button
            type="button"
            class="btn primary"
            :disabled="busy || readOnly"
            data-testid="confirm-import"
            @click="confirmImport"
          >
            {{ $t('ieImportConfirm') }}
          </button>
          <button type="button" class="btn" @click="cancelImport">
            {{ $t('cancel') }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="notice error" role="alert" data-testid="ie-error">{{ error }}</p>
    <p v-if="message" class="notice ok" role="status" data-testid="ie-message">{{ message }}</p>
  </section>
</template>
