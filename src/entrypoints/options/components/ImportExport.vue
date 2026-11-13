<script setup lang="ts">
import { ref } from 'vue';
import type { Config } from '../../../core/model';
import type { ConfigRepository } from '../../../core/storage';
import { exportFileName, exportJson, parseImport } from '../composables/format';

const props = defineProps<{ repo: ConfigRepository }>();
const emit = defineEmits<{ imported: [] }>();

const error = ref<string | null>(null);
const message = ref<string | null>(null);
const preview = ref<{ config: Config; warnings: string[]; fileName: string } | null>(null);
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function doExport(): Promise<void> {
  error.value = null;
  message.value = null;
  try {
    const config = await props.repo.load();
    const blob = new Blob([exportJson(config)], { type: 'application/json' });
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
        segurança ou para levar a outro computador.
      </p>
      <button type="button" class="btn primary" data-testid="export" @click="doExport">
        Exportar configuração
      </button>
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
            :disabled="busy"
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
