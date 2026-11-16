<script setup lang="ts">
import { t } from '../../../core/i18n';
import { computed, ref, watch } from 'vue';
import type { Rule, Variable } from '../../../core/model';
import { MAX_ITEM_BYTES, StorageQuotaError, measureVariables } from '../../../core/storage';
import SizeMeter from './SizeMeter.vue';
import {
  rowsToVariables,
  validateVariableRows,
  variableUsage,
  type VariableRow,
} from '../composables/variables';

const props = defineProps<{
  variables: Variable[];
  rules: Rule[];
  loaded: boolean;
  save: (variables: Variable[]) => Promise<void>;
  /** Configuração de versão mais nova: nada pode ser editado. */
  readOnly?: boolean;
}>();

let nextUid = 1;
function toRows(vars: readonly Variable[]): VariableRow[] {
  return vars.map((v) => {
    const { key, label, value, scope, ...rest } = v;
    const row: VariableRow = { uid: nextUid++, key, label, value, scope: scope ?? 'sync' };
    if (Object.keys(rest).length > 0) row.extra = rest;
    return row;
  });
}
type Triple = [string, string, string, string];
const triples = (
  list: readonly { key: string; label: string; value: string; scope: string }[],
): Triple[] => list.map((r) => [r.key, r.label, r.value, r.scope]);

const rows = ref<VariableRow[]>(toRows(props.variables));
let baseline: Triple[] = triples(rows.value);
const dirty = computed(() => JSON.stringify(triples(rows.value)) !== JSON.stringify(baseline));

function reset(vars: readonly Variable[]): void {
  rows.value = toRows(vars);
  baseline = triples(rows.value);
}

// Mudança vinda de fora (outra aba/dispositivo) só entra se não houver edição em andamento.
watch(
  () => props.variables,
  (vars) => {
    if (!dirty.value) reset(vars);
  },
);

const attempted = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);

const errors = computed(() => validateVariableRows(rows.value));
const varsBytes = computed(() => measureVariables(rowsToVariables(rows.value)));

/** Erro mostrado na linha: sempre que a chave foi digitada; chave vazia só após tentar salvar. */
function rowError(r: VariableRow): string | null {
  const e = errors.value.get(r.uid);
  if (!e) return null;
  if (r.key.trim() === '' && !attempted.value) return null;
  return e;
}

function usageOf(r: VariableRow) {
  return variableUsage(r.key, props.rules);
}

function add(): void {
  rows.value.push({ uid: nextUid++, key: '', label: '', value: '', scope: 'sync' });
}

// -------------------------------------------------------------- exclusão
const pendingDelete = ref<number | null>(null);
const pendingRow = computed(() => rows.value.find((r) => r.uid === pendingDelete.value) ?? null);

function isSaved(r: VariableRow): boolean {
  return props.variables.some((v) => v.key === r.key.trim());
}

async function persist(vars: Variable[]): Promise<boolean> {
  saveError.value = null;
  saving.value = true;
  try {
    await props.save(vars);
    return true;
  } catch (e) {
    saveError.value =
      e instanceof StorageQuotaError
        ? e.message
        : t('saveFailed', e instanceof Error ? e.message : String(e));
    return false;
  } finally {
    saving.value = false;
  }
}

async function removeNow(uid: number): Promise<void> {
  const row = rows.value.find((r) => r.uid === uid);
  if (!row) return;
  pendingDelete.value = null;
  if (!isSaved(row)) {
    rows.value = rows.value.filter((r) => r.uid !== uid);
    return;
  }
  // Exclusão de variável salva vale na hora; as outras edições em andamento ficam como estão.
  const key = row.key.trim();
  const ok = await persist(props.variables.filter((v) => v.key !== key));
  if (ok) {
    rows.value = rows.value.filter((r) => r.uid !== uid);
    baseline = baseline.filter((b) => b[0] !== key);
  }
}

function askRemove(r: VariableRow): void {
  if (usageOf(r).length > 0) pendingDelete.value = r.uid;
  else void removeNow(r.uid);
}

// ---------------------------------------------------------------- salvar
async function submit(): Promise<void> {
  attempted.value = true;
  if (errors.value.size > 0) return;
  const ok = await persist(rowsToVariables(rows.value));
  if (ok) {
    attempted.value = false;
    reset(rowsToVariables(rows.value));
  }
}

function onScope(r: VariableRow, ev: Event): void {
  r.scope = (ev.target as HTMLSelectElement).value === 'local' ? 'local' : 'sync';
}

function onField(r: VariableRow, key: 'key' | 'label' | 'value', ev: Event): void {
  r[key] = (ev.target as HTMLInputElement).value;
}
</script>

<template>
  <form class="variables" novalidate @submit.prevent="submit">
    <fieldset class="ro-fieldset" :disabled="readOnly">
      <div class="section-head">
        <h2>{{ $t('tabVariables') }}</h2>
      </div>

      <p class="notice warn" data-testid="vars-warning">
        {{ $t('varWarning') }}
      </p>
      <p class="hint">
        {{ $t('varUseAs') }} <code>{{ $t('varUseExample') }}</code>
      </p>

      <p v-if="saveError" class="notice error" role="alert" data-testid="vars-error">
        {{ saveError }}
      </p>

      <div v-if="pendingRow" class="notice warn" role="alertdialog" data-testid="delete-warning">
        <p>
          <strong>{{ $t('varInUse', pendingRow.key) }}</strong>
          {{ $t('varInUseRest') }}
        </p>
        <ul>
          <li v-for="u in usageOf(pendingRow)" :key="u.ruleId">
            {{ u.ruleName }} — {{ u.fields.join(', ') }}
          </li>
        </ul>
        <div class="row">
          <button
            type="button"
            class="btn danger"
            data-testid="confirm-delete"
            @click="removeNow(pendingRow.uid)"
          >
            {{ $t('varDeleteAnyway') }}
          </button>
          <button
            type="button"
            class="btn"
            data-testid="cancel-delete"
            @click="pendingDelete = null"
          >
            {{ $t('cancel') }}
          </button>
        </div>
      </div>

      <p v-if="loaded && rows.length === 0" class="muted">
        {{ $t('varEmpty') }}
      </p>

      <ul class="var-list">
        <li v-for="r in rows" :key="r.uid" class="var-row field-card" :data-var-key="r.key">
          <div class="grid">
            <div class="control">
              <label :for="`v${r.uid}-key`">{{ $t('varKey') }}</label>
              <input
                :id="`v${r.uid}-key`"
                class="v-key"
                type="text"
                autocomplete="off"
                spellcheck="false"
                :placeholder="$t('varKeyPlaceholder')"
                :value="r.key"
                :aria-invalid="rowError(r) !== null"
                :aria-describedby="rowError(r) ? `v${r.uid}-err` : undefined"
                @input="onField(r, 'key', $event)"
              />
            </div>
            <div class="control">
              <label :for="`v${r.uid}-label`">{{ $t('varLabel') }}</label>
              <input
                :id="`v${r.uid}-label`"
                class="v-label"
                type="text"
                autocomplete="off"
                :placeholder="$t('varLabelPlaceholder')"
                :value="r.label"
                @input="onField(r, 'label', $event)"
              />
            </div>
            <div class="control">
              <label :for="`v${r.uid}-value`">{{ $t('ftValue') }}</label>
              <input
                :id="`v${r.uid}-value`"
                class="v-value"
                type="text"
                autocomplete="off"
                :value="r.value"
                @input="onField(r, 'value', $event)"
              />
            </div>
            <div class="control">
              <label :for="`v${r.uid}-scope`">{{ $t('varScope') }}</label>
              <select
                :id="`v${r.uid}-scope`"
                class="v-scope"
                data-testid="var-scope"
                :value="r.scope"
                @change="onScope(r, $event)"
              >
                <option value="sync">{{ $t('varScopeSync') }}</option>
                <option value="local">{{ $t('varScopeLocal') }}</option>
              </select>
            </div>
          </div>
          <p
            v-if="r.scope === 'local' && r.value === ''"
            class="hint v-novalue"
            data-testid="var-no-value"
          >
            {{ $t('varNoValue') }}
          </p>
          <p v-if="rowError(r)" :id="`v${r.uid}-err`" class="error-text" role="alert">
            {{ rowError(r) }}
          </p>
          <p v-if="usageOf(r).length > 0" class="hint v-usage">
            {{ $t('varUsedIn') }}
            <span v-for="(u, i) in usageOf(r)" :key="u.ruleId"
              >{{ i > 0 ? '; ' : '' }}{{ u.ruleName }} ({{ u.fields.join(', ') }})</span
            >
          </p>
          <p v-else class="hint v-usage">{{ $t('varUnused') }}</p>
          <div class="row">
            <button
              type="button"
              class="btn small danger v-remove"
              :aria-label="$t('varDeleteAria', r.key || $t('varNoKey'))"
              @click="askRemove(r)"
            >
              {{ $t('delete') }}
            </button>
          </div>
        </li>
      </ul>

      <SizeMeter :bytes="varsBytes" :limit="MAX_ITEM_BYTES" :over-message="$t('sizeOverVars')" />

      <div class="actions-bar">
        <button type="button" class="btn" data-testid="add-variable" @click="add">
          {{ $t('varAdd') }}
        </button>
        <button
          type="submit"
          class="btn primary"
          :disabled="saving || !dirty"
          data-testid="save-variables"
        >
          {{ saving ? $t('saving') : $t('varSave') }}
        </button>
        <span v-if="dirty" class="muted">{{ $t('unsavedChanges') }}</span>
      </div>
    </fieldset>
  </form>
</template>
