<script setup lang="ts">
import { ref } from 'vue';
import type { Config, Rule } from '../../../core/model';
import type { ConfigRepository } from '../../../core/storage';
import { exportFileName, exportJson, parseImport } from '../composables/format';
import { parseAddition, planMerge, type Addition, type MergePlan } from '../composables/merge';
import { hostOfPattern } from '../composables/draft';

const props = defineProps<{ repo: ConfigRepository; readOnly?: boolean }>();
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
    message.value = `Arquivo ${a.download} gerado.`;
  } catch (e) {
    error.value = `Não foi possível exportar: ${e instanceof Error ? e.message : String(e)}`;
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
    message.value = 'Configuração importada com sucesso.';
    preview.value = null;
    emit('imported');
  } catch (e) {
    error.value = `Não foi possível importar: ${e instanceof Error ? e.message : String(e)}`;
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
      addError.value = `Não foi possível ler a configuração atual: ${
        e instanceof Error ? e.message : String(e)
      }`;
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
      <h2 id="ie-title">Importar/Exportar</h2>
    </div>

    <div class="panel">
      <h3>Exportar</h3>
      <p class="hint">
        Baixa um arquivo com todas as suas regras, variáveis e preferências, útil como cópia de
        segurança ou para levar a outro computador. Os valores das variáveis “Só neste navegador”
        ficam de fora, a menos que você marque a opção abaixo.
      </p>
      <label class="check">
        <input v-model="includeLocal" type="checkbox" data-testid="export-include-local" />
        Incluir valores das variáveis locais
      </label>
      <p v-if="includeLocal" class="notice warn" data-testid="export-local-warning">
        O arquivo vai conter os valores das variáveis “Só neste navegador” em texto aberto. Guarde-o
        com cuidado e não o compartilhe.
      </p>
      <button type="button" class="btn primary" data-testid="export" @click="doExport">
        Exportar configuração
      </button>
    </div>

    <div class="panel" data-testid="add-panel">
      <h3>Adicionar regras de um arquivo</h3>
      <p class="hint">
        Escolha um arquivo com <strong>uma regra</strong> (como o exemplo em
        <code>presets/exemplo-cadastro.json</code>) ou uma configuração exportada. As regras são
        <strong>adicionadas</strong> às que você já tem; nada é apagado nem substituído.
      </p>
      <label for="add-file" class="block-label">Arquivo de regra ou configuração (.json)</label>
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
          <strong>{{ addPreview.fileName }}</strong> vai adicionar
          {{ addPreview.plan.rules.length }}
          {{ addPreview.plan.rules.length === 1 ? 'regra' : 'regras' }}:
        </p>
        <ul>
          <li v-for="r in addPreview.plan.rules" :key="r.id">
            {{ r.name }} <span class="muted">({{ sitesOf(r) }})</span>
          </li>
        </ul>
        <p v-if="addPreview.plan.renamed.length > 0" data-testid="add-renamed">
          {{
            addPreview.plan.renamed.length === 1 ? 'Uma regra já usava' : 'Algumas regras já usavam'
          }}
          o mesmo identificador e receberam um novo: nenhuma regra existente é alterada.
        </p>
        <p v-if="addPreview.plan.newVariables.length > 0">
          Variáveis novas:
          {{ addPreview.plan.newVariables.map((v) => v.key).join(', ') }}.
        </p>
        <p v-if="addPreview.plan.skippedVariables.length > 0">
          Variáveis que você já tem (mantidas):
          {{ addPreview.plan.skippedVariables.join(', ') }}.
        </p>
        <template v-if="addPreview.addition.warnings.length > 0">
          <p>Avisos:</p>
          <ul>
            <li v-for="w in addPreview.addition.warnings" :key="w">{{ w }}</li>
          </ul>
        </template>
        <p class="hint">
          Para sites novos, o Chrome vai pedir permissão de acesso ao clicar em adicionar.
        </p>
        <div class="row">
          <button
            type="button"
            class="btn primary"
            data-testid="confirm-add"
            :disabled="readOnly"
            @click="confirmAdd"
          >
            Adicionar à minha configuração
          </button>
          <button type="button" class="btn" @click="cancelAdd">Cancelar</button>
        </div>
      </div>
      <p v-if="addError" class="notice error" role="alert" data-testid="add-error">
        {{ addError }}
      </p>
    </div>

    <div class="panel">
      <h3>Importar</h3>
      <p class="hint">
        Escolha um arquivo exportado antes. Você verá um resumo e poderá confirmar. A importação
        <strong>substitui</strong> toda a configuração atual.
      </p>
      <label for="import-file" class="block-label">Arquivo de configuração (.json)</label>
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
          <strong>{{ preview.fileName }}</strong>: {{ preview.config.rules.length }}
          {{ preview.config.rules.length === 1 ? 'regra' : 'regras' }} e
          {{ preview.config.variables.length }}
          {{ preview.config.variables.length === 1 ? 'variável' : 'variáveis' }}.
        </p>
        <template v-if="preview.warnings.length > 0">
          <p>Avisos:</p>
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
            Substituir minha configuração
          </button>
          <button type="button" class="btn" @click="cancelImport">Cancelar</button>
        </div>
      </div>
    </div>

    <p v-if="error" class="notice error" role="alert" data-testid="ie-error">{{ error }}</p>
    <p v-if="message" class="notice ok" role="status" data-testid="ie-message">{{ message }}</p>
  </section>
</template>
