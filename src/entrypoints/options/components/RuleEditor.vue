<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Rule, Variable } from '../../../core/model';
import { StorageQuotaError } from '../../../core/storage';
import {
  MODE_OPTIONS,
  OVERWRITE_OPTIONS,
  cloneDraft,
  isDirty,
  validateDraft,
  type RuleDraft,
} from '../composables/draft';
import type { CaptureFocus } from '../composables/picker';
import { defaultExampleUrl, parseExampleUrl } from '../composables/preview';
import FieldTable from './FieldTable.vue';
import { overlappingRules } from '../../../core/engine/matcher';
import { classifyOrigins, hostOfOrigin } from '../../../shared/permissions';

const props = defineProps<{
  initial: RuleDraft;
  existingIds: string[];
  /** Regras salvas (para avisar de padrões de URL que se sobrepõem). */
  otherRules?: Rule[];
  /** Variáveis salvas (usadas na pré-visualização e nas sugestões). */
  variables: Variable[];
  /** A regra em edição mudou (ou sumiu) no armazenamento enquanto o editor estava aberto. */
  externalChange: 'changed' | 'removed' | null;
  save: (rule: Rule) => Promise<void>;
  /** Editor aberto a partir de "Capturar campo": campo a focar e dica do valor atual. */
  captureFocus?: CaptureFocus | null;
  /** Configuração de versão mais nova: a regra pode ser vista, mas não salva. */
  readOnly?: boolean;
}>();
const emit = defineEmits<{ cancel: []; reload: [] }>();

const draft = ref<RuleDraft>(cloneDraft(props.initial));
const attempted = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);
const errorBox = ref<HTMLElement | null>(null);

// Prévia estável (sem sorteio de id) para marcar erros ao vivo.
const live = computed(() => validateDraft(draft.value, { rng: () => 0.5 }));
const dirty = computed(() => isDirty(props.initial, draft.value));
defineExpose({ dirty });

const shownErrors = computed<Record<string, string[]>>(() => {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(live.value.byKey)) {
    // erros de sintaxe do valor já aparecem ao vivo dentro da tabela
    if (k.endsWith('.value')) continue;
    // faixas de atraso/intervalo aparecem ao vivo; os demais só depois de tentar salvar
    const liveKey = k.endsWith('.delay') || k.endsWith('.keyDelay');
    if (!attempted.value && !liveKey) continue;
    out[k] = v;
  }
  return out;
});

// URL de exemplo da pré-visualização: padrão derivado do 1º padrão de URL até o usuário editar.
const exampleOverride = ref<string | null>(null);
const exampleUrl = computed({
  get: () => exampleOverride.value ?? defaultExampleUrl(draft.value.urlPatterns),
  set: (v: string) => (exampleOverride.value = v),
});
const exampleUrlInvalid = computed(() => parseExampleUrl(exampleUrl.value) === null);

const summaryMessages = computed(() => (attempted.value ? live.value.messages : []));

function err(key: string): string | null {
  const e = shownErrors.value[key];
  return e && e.length > 0 ? e.join('; ') : null;
}

// Avisos de permissão (não bloqueiam o salvamento).
const originClasses = computed(() => classifyOrigins(draft.value.urlPatterns));

const overlaps = computed(() =>
  overlappingRules(
    {
      id: draft.value.id,
      trigger: {
        urlPatterns: draft.value.urlPatterns.map((p) => p.trim()).filter((p) => p !== ''),
        settleMs: draft.value.settleMs,
      },
    },
    props.otherRules ?? [],
  ),
);

const priorityModel = computed<number | string>({
  get: () => draft.value.priority ?? '',
  set: (v) => {
    draft.value.priority = v === '' || v === null || Number.isNaN(Number(v)) ? null : Number(v);
  },
});

function patternError(i: number): string | null {
  return err(`urlPatterns.${i}`);
}

function addPattern(): void {
  draft.value.urlPatterns.push('');
}

function removePattern(i: number): void {
  if (draft.value.urlPatterns.length > 1) draft.value.urlPatterns.splice(i, 1);
  else draft.value.urlPatterns[0] = '';
}

function focusErrors(): void {
  void nextTick(() => errorBox.value?.focus());
}

async function submit(): Promise<void> {
  attempted.value = true;
  saveError.value = null;
  const result = validateDraft(draft.value, { existingIds: props.existingIds });
  if (!result.ok || !result.rule) {
    focusErrors();
    return;
  }
  saving.value = true;
  try {
    await props.save(result.rule);
  } catch (e) {
    saveError.value =
      e instanceof StorageQuotaError
        ? e.message
        : `Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`;
    focusErrors();
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (dirty.value && !window.confirm('Há alterações não salvas. Descartar e sair?')) return;
  emit('cancel');
}

function beforeUnload(ev: BeforeUnloadEvent): void {
  if (dirty.value) ev.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <form class="editor" novalidate @submit.prevent="submit">
    <div class="section-head">
      <h2>{{ initial.isNew ? 'Nova regra' : 'Editar regra' }}</h2>
    </div>

    <div v-if="externalChange" class="notice warn" role="status" data-testid="external-change">
      <p>
        <strong>Esta regra foi alterada em outro lugar.</strong>
        {{
          externalChange === 'removed'
            ? 'Ela foi excluída; se você salvar, ela será criada de novo.'
            : 'Se você salvar, suas alterações substituem a versão salva.'
        }}
      </p>
      <button v-if="externalChange === 'changed'" type="button" class="btn" @click="emit('reload')">
        Descartar minhas alterações e recarregar
      </button>
    </div>

    <div
      v-if="captureFocus?.duplicate"
      class="notice warn"
      role="status"
      data-testid="capture-duplicate"
    >
      <p>
        <strong>Este campo já está nesta regra.</strong>
        Nada foi adicionado; o campo existente está em foco abaixo.
      </p>
    </div>

    <div
      v-if="summaryMessages.length > 0 || saveError"
      ref="errorBox"
      class="notice error"
      role="alert"
      tabindex="-1"
      data-testid="error-summary"
    >
      <p v-if="saveError">
        <strong>{{ saveError }}</strong>
      </p>
      <template v-if="summaryMessages.length > 0">
        <p>
          <strong>Corrija os itens abaixo para salvar:</strong>
        </p>
        <ul>
          <li v-for="m in summaryMessages" :key="m">{{ m }}</li>
        </ul>
      </template>
    </div>

    <div class="control example-url">
      <label for="example-url">URL de exemplo (só para a pré-visualização dos valores)</label>
      <input
        id="example-url"
        v-model="exampleUrl"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="exampleUrlInvalid"
      />
      <p v-if="exampleUrlInvalid" class="error-text">
        URL inválida; a pré-visualização usa https://exemplo.com/.
      </p>
    </div>

    <fieldset class="panel">
      <legend>Identificação</legend>
      <div class="control">
        <label for="rule-name">Nome da regra</label>
        <input
          id="rule-name"
          v-model="draft.name"
          type="text"
          autocomplete="off"
          :aria-invalid="err('name') !== null"
          :aria-describedby="err('name') ? 'rule-name-err' : undefined"
          placeholder="Ex.: NFS-e: NBS e consumo pessoal"
        />
        <p v-if="err('name')" id="rule-name-err" class="error-text">{{ err('name') }}</p>
      </div>
    </fieldset>

    <fieldset class="panel">
      <legend>Onde a regra vale</legend>
      <p class="hint">
        Endereços das páginas, no formato <code>https://site.com/*</code> (o <code>*</code> vale
        para qualquer final).
      </p>
      <div v-for="(_, i) in draft.urlPatterns" :key="i" class="control pattern-row">
        <label :for="`url-${i}`">Padrão de URL {{ i + 1 }}</label>
        <div class="row">
          <input
            :id="`url-${i}`"
            v-model="draft.urlPatterns[i]"
            class="url-pattern"
            type="text"
            autocomplete="off"
            placeholder="https://site.com/*"
            :aria-invalid="patternError(i) !== null"
            :aria-describedby="patternError(i) ? `url-${i}-err` : undefined"
          />
          <button
            type="button"
            class="btn small danger"
            :aria-label="`Remover padrão de URL ${i + 1}`"
            @click="removePattern(i)"
          >
            Remover
          </button>
        </div>
        <p v-if="patternError(i)" :id="`url-${i}-err`" class="error-text">{{ patternError(i) }}</p>
      </div>
      <p v-if="err('urlPatterns')" class="error-text">{{ err('urlPatterns') }}</p>
      <p v-if="originClasses.insecure.length > 0" class="hint warn-text" data-testid="warn-http">
        Conexão não segura ({{ originClasses.insecure.map(hostOfOrigin).join(', ') }}). Este site
        usa http: os valores preenchidos trafegam sem criptografia.
      </p>
      <p v-if="originClasses.broad.length > 0" class="hint warn-text" data-testid="warn-broad">
        Esse padrão vale para qualquer site. Informe um site específico (por exemplo
        https://site.com/*): a extensão não pede permissão para todos os sites.
      </p>
      <p v-if="originClasses.needed.length > 0" class="hint" data-testid="info-permission">
        Ao salvar, o navegador vai pedir permissão para acessar
        {{ originClasses.needed.map(hostOfOrigin).join(', ') }}.
      </p>
      <p v-if="overlaps.length > 0" class="hint warn-text" data-testid="warn-overlap">
        Outra regra também pode atuar nestas páginas: {{ overlaps.map((r) => r.name).join(', ') }}.
        Se forem para o mesmo formulário, a de maior prioridade preenche primeiro.
      </p>
      <button type="button" class="btn" @click="addPattern">Adicionar padrão de URL</button>

      <div class="control">
        <label for="container-selector">Contêiner: seletor CSS (opcional)</label>
        <input
          id="container-selector"
          v-model="draft.containerSelector"
          type="text"
          autocomplete="off"
          placeholder=".modal.is-active"
          :aria-invalid="err('container') !== null"
        />
      </div>
      <div class="control">
        <label for="container-text">Contêiner: texto que deve conter (opcional)</label>
        <input
          id="container-text"
          v-model="draft.containerText"
          type="text"
          autocomplete="off"
          placeholder="Emitir Nota Fiscal"
        />
        <p class="hint">
          Use para a regra só valer dentro de uma parte da página, por exemplo um modal. Ex.: o
          título do modal.
        </p>
        <p v-if="err('container')" class="error-text">{{ err('container') }}</p>
      </div>

      <details class="advanced">
        <summary>Avançado: tempo de espera</summary>
        <div class="control">
          <label for="settle">Espera antes de preencher (milissegundos)</label>
          <input
            id="settle"
            v-model.number="draft.settleMs"
            type="number"
            min="0"
            max="10000"
            step="50"
            :aria-invalid="err('settleMs') !== null"
          />
          <p class="hint">
            Tempo que a extensão aguarda a página parar de mudar antes de preencher. Padrão: 300.
          </p>
          <p v-if="err('settleMs')" class="error-text">{{ err('settleMs') }}</p>
        </div>
      </details>
    </fieldset>

    <fieldset class="panel">
      <legend>Comportamento</legend>
      <div class="radio-group" role="radiogroup" aria-labelledby="mode-label">
        <p id="mode-label" class="group-label">Quando preencher</p>
        <label v-for="o in MODE_OPTIONS" :key="o.id" class="radio">
          <input v-model="draft.mode" type="radio" name="mode" :value="o.id" />
          <span>
            <strong>{{ o.label }}</strong>
            <small>{{ o.description }}</small>
          </span>
        </label>
      </div>
      <div class="radio-group" role="radiogroup" aria-labelledby="overwrite-label">
        <p id="overwrite-label" class="group-label">Sobrescrever valores existentes</p>
        <label v-for="o in OVERWRITE_OPTIONS" :key="o.id" class="radio">
          <input v-model="draft.overwrite" type="radio" name="overwrite" :value="o.id" />
          <span>
            <strong>{{ o.label }}</strong>
            <small>{{ o.description }}</small>
          </span>
        </label>
      </div>
      <details class="advanced">
        <summary>Avançado: prioridade</summary>
        <div class="control">
          <label for="priority">Prioridade (0 a 100)</label>
          <input
            id="priority"
            v-model="priorityModel"
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="50"
            :aria-invalid="err('priority') !== null"
          />
          <p class="hint">
            Quando várias regras atuam no mesmo formulário, a de maior prioridade preenche primeiro
            e as outras pulam os campos que ela já preencheu. Vazio = padrão (50). Em empate, vale a
            ordem das regras.
          </p>
          <p v-if="err('priority')" class="error-text">{{ err('priority') }}</p>
        </div>
      </details>
    </fieldset>

    <FieldTable
      v-model:fields="draft.fields"
      :errors="shownErrors"
      :variables="variables"
      :example-url="exampleUrl"
      :focus-field-id="captureFocus?.fieldId ?? null"
      :hints="captureFocus ? { [captureFocus.fieldId]: captureFocus.hint } : {}"
    />
    <p v-if="err('fields')" class="error-text">{{ err('fields') }}</p>

    <div class="actions-bar">
      <button
        type="submit"
        class="btn primary"
        :disabled="saving || readOnly"
        data-testid="save-rule"
      >
        {{ saving ? 'Salvando…' : 'Salvar' }}
      </button>
      <button type="button" class="btn" data-testid="cancel-edit" @click="cancel">Cancelar</button>
      <span v-if="dirty" class="muted">Alterações não salvas</span>
    </div>
  </form>
</template>
