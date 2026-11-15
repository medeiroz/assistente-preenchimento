<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Rule, Variable } from '../../../core/model';
import { StorageQuotaError } from '../../../core/storage';
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
    const { key, label, value, ...rest } = v;
    const row: VariableRow = { uid: nextUid++, key, label, value };
    if (Object.keys(rest).length > 0) row.extra = rest;
    return row;
  });
}
type Triple = [string, string, string];
const triples = (list: readonly { key: string; label: string; value: string }[]): Triple[] =>
  list.map((r) => [r.key, r.label, r.value]);

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
  rows.value.push({ uid: nextUid++, key: '', label: '', value: '' });
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
        : `Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`;
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
    baseline = baseline.filter((t) => t[0] !== key);
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

function onField(r: VariableRow, key: 'key' | 'label' | 'value', ev: Event): void {
  r[key] = (ev.target as HTMLInputElement).value;
}
</script>

<template>
  <form class="variables" novalidate @submit.prevent="submit">
    <fieldset class="ro-fieldset" :disabled="readOnly">
      <div class="section-head">
        <h2>Variáveis</h2>
      </div>

      <p class="notice warn" data-testid="vars-warning">
        Variáveis sincronizam pela sua conta Google — não guarde senhas aqui.
      </p>
      <p class="hint">
        Use em qualquer campo como <code v-pre>{{ var.sua_chave }}</code>
      </p>

      <p v-if="saveError" class="notice error" role="alert" data-testid="vars-error">
        {{ saveError }}
      </p>

      <div v-if="pendingRow" class="notice warn" role="alertdialog" data-testid="delete-warning">
        <p>
          <strong>A variável “{{ pendingRow.key }}” está em uso.</strong> Se você excluí-la, estes
          campos ficarão sem valor (o preenchimento deles será ignorado):
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
            Excluir mesmo assim
          </button>
          <button
            type="button"
            class="btn"
            data-testid="cancel-delete"
            @click="pendingDelete = null"
          >
            Cancelar
          </button>
        </div>
      </div>

      <p v-if="loaded && rows.length === 0" class="muted">
        Nenhuma variável ainda. Use “Adicionar variável” para criar uma.
      </p>

      <ul class="var-list">
        <li v-for="r in rows" :key="r.uid" class="var-row field-card" :data-var-key="r.key">
          <div class="grid">
            <div class="control">
              <label :for="`v${r.uid}-key`">Chave</label>
              <input
                :id="`v${r.uid}-key`"
                class="v-key"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="codigo_teste"
                :value="r.key"
                :aria-invalid="rowError(r) !== null"
                :aria-describedby="rowError(r) ? `v${r.uid}-err` : undefined"
                @input="onField(r, 'key', $event)"
              />
            </div>
            <div class="control">
              <label :for="`v${r.uid}-label`">Nome amigável</label>
              <input
                :id="`v${r.uid}-label`"
                class="v-label"
                type="text"
                autocomplete="off"
                placeholder="Código de teste"
                :value="r.label"
                @input="onField(r, 'label', $event)"
              />
            </div>
            <div class="control">
              <label :for="`v${r.uid}-value`">Valor</label>
              <input
                :id="`v${r.uid}-value`"
                class="v-value"
                type="text"
                autocomplete="off"
                :value="r.value"
                @input="onField(r, 'value', $event)"
              />
            </div>
          </div>
          <p v-if="rowError(r)" :id="`v${r.uid}-err`" class="error-text" role="alert">
            {{ rowError(r) }}
          </p>
          <p v-if="usageOf(r).length > 0" class="hint v-usage">
            Usada em:
            <span v-for="(u, i) in usageOf(r)" :key="u.ruleId"
              >{{ i > 0 ? '; ' : '' }}{{ u.ruleName }} ({{ u.fields.join(', ') }})</span
            >
          </p>
          <p v-else class="hint v-usage">Não usada em nenhuma regra.</p>
          <div class="row">
            <button
              type="button"
              class="btn small danger v-remove"
              :aria-label="`Excluir a variável ${r.key || 'sem chave'}`"
              @click="askRemove(r)"
            >
              Excluir
            </button>
          </div>
        </li>
      </ul>

      <div class="actions-bar">
        <button type="button" class="btn" data-testid="add-variable" @click="add">
          Adicionar variável
        </button>
        <button
          type="submit"
          class="btn primary"
          :disabled="saving || !dirty"
          data-testid="save-variables"
        >
          {{ saving ? 'Salvando…' : 'Salvar variáveis' }}
        </button>
        <span v-if="dirty" class="muted">Alterações não salvas</span>
      </div>
    </fieldset>
  </form>
</template>
