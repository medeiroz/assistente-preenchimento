<script setup lang="ts">
import { computed } from 'vue';
import { FILTER_NAMES } from '../../../core/expressions';
import type { Variable } from '../../../core/model';
import {
  ADAPTER_OPTIONS,
  LOCATOR_OPTIONS,
  LOCATOR_PLACEHOLDERS,
  fieldValueError,
  moveField,
  newFieldDraft,
  type AdapterChoice,
  type FieldDraft,
  type LocatorBy,
} from '../composables/draft';
import { valueSuggestions } from '../composables/variables';
import ValuePreview from './ValuePreview.vue';

const props = defineProps<{
  fields: FieldDraft[];
  /** Erros do schema por chave (`fields.<id>.locator`...). A sintaxe do valor é checada aqui, ao vivo. */
  errors: Record<string, string[]>;
  /** Variáveis salvas (preview e sugestões). */
  variables: Variable[];
  /** URL de exemplo para a pré-visualização. */
  exampleUrl: string;
}>();
const emit = defineEmits<{ 'update:fields': [fields: FieldDraft[]] }>();

const filters = FILTER_NAMES.join(', ');
const suggestions = computed(() => valueSuggestions(props.variables));

function patch(index: number, change: Partial<FieldDraft>): void {
  emit(
    'update:fields',
    props.fields.map((f, i) => (i === index ? { ...f, ...change } : f)),
  );
}

function onText(index: number, key: 'locatorValue' | 'value' | 'defaultValue', ev: Event): void {
  patch(index, { [key]: (ev.target as HTMLInputElement).value });
}

function onSelect(index: number, key: 'locatorBy' | 'adapter', ev: Event): void {
  const v = (ev.target as HTMLSelectElement).value;
  patch(
    index,
    key === 'locatorBy' ? { locatorBy: v as LocatorBy } : { adapter: v as AdapterChoice },
  );
}

function add(): void {
  emit('update:fields', [...props.fields, newFieldDraft(props.fields)]);
}

function move(index: number, dir: -1 | 1): void {
  emit('update:fields', moveField(props.fields, index, dir));
}

function remove(index: number): void {
  emit(
    'update:fields',
    props.fields.filter((_, i) => i !== index),
  );
}

function valueError(f: FieldDraft): string | null {
  return fieldValueError(f.value);
}

function locatorErrors(f: FieldDraft): string[] {
  return props.errors[`fields.${f.id}.locator`] ?? [];
}

function otherErrors(f: FieldDraft): string[] {
  return props.errors[`fields.${f.id}.field`] ?? [];
}
</script>

<template>
  <fieldset class="panel">
    <legend>Campos a preencher</legend>

    <details class="help">
      <summary>Como escrever valores com <span v-pre>{{}}</span></summary>
      <p>
        Escreva o texto que será digitado no campo. Para valores que mudam, use blocos
        <code v-pre>{{ fonte | filtro }}</code>:
      </p>
      <ul>
        <li>
          <code v-pre>{{ var.nome }}</code> — variável cadastrada
        </li>
        <li>
          <code v-pre>{{ url.query.ref }}</code> — parâmetro da URL
        </li>
        <li>
          <code v-pre>{{ now | date('DD/MM/YYYY') }}</code> — data de hoje
        </li>
        <li>
          <code v-pre>{{ url.query.ref | default("sem-ref") }}</code> — com valor reserva
        </li>
      </ul>
      <p>
        Filtros disponíveis: <code>{{ filters }}</code>
      </p>
    </details>

    <datalist id="value-suggestions">
      <option v-for="s in suggestions" :key="s.text" :value="s.text">{{ s.hint }}</option>
    </datalist>

    <p v-if="fields.length === 0" class="muted">
      Nenhum campo ainda. Use “Adicionar campo” para dizer o que preencher.
    </p>

    <ol class="fields">
      <li v-for="(f, i) in fields" :key="f.id" class="field-card" :data-field-id="f.id">
        <div class="field-head">
          <span class="field-number">Campo {{ i + 1 }}</span>
          <label class="inline">
            <input
              type="checkbox"
              class="f-enabled"
              :checked="f.enabled"
              @change="patch(i, { enabled: ($event.target as HTMLInputElement).checked })"
            />
            Ativo
          </label>
          <span class="spacer"></span>
          <button
            type="button"
            class="btn small"
            :disabled="i === 0"
            :aria-label="`Mover campo ${i + 1} para cima`"
            @click="move(i, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn small"
            :disabled="i === fields.length - 1"
            :aria-label="`Mover campo ${i + 1} para baixo`"
            @click="move(i, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="btn small danger f-remove"
            :aria-label="`Remover campo ${i + 1}`"
            @click="remove(i)"
          >
            Remover
          </button>
        </div>

        <div class="grid">
          <div class="control">
            <label :for="`f${i}-by`">Como encontrar</label>
            <select
              :id="`f${i}-by`"
              class="f-by"
              :value="f.locatorBy"
              @change="onSelect(i, 'locatorBy', $event)"
            >
              <option v-for="o in LOCATOR_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </div>
          <div class="control">
            <label :for="`f${i}-loc`">
              {{ LOCATOR_OPTIONS.find((o) => o.id === f.locatorBy)?.label }} do campo
            </label>
            <input
              :id="`f${i}-loc`"
              class="f-locator"
              type="text"
              :value="f.locatorValue"
              :placeholder="LOCATOR_PLACEHOLDERS[f.locatorBy]"
              :aria-invalid="locatorErrors(f).length > 0"
              :aria-describedby="locatorErrors(f).length > 0 ? `f${i}-loc-err` : undefined"
              @input="onText(i, 'locatorValue', $event)"
            />
            <p v-if="locatorErrors(f).length > 0" :id="`f${i}-loc-err`" class="error-text">
              {{ locatorErrors(f).join('; ') }}
            </p>
          </div>
          <div class="control">
            <label :for="`f${i}-type`">Tipo</label>
            <select
              :id="`f${i}-type`"
              class="f-type"
              :value="f.adapter"
              @change="onSelect(i, 'adapter', $event)"
            >
              <option v-for="o in ADAPTER_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </div>
          <div class="control wide">
            <label :for="`f${i}-value`">Valor</label>
            <input
              :id="`f${i}-value`"
              class="f-value"
              type="text"
              :value="f.value"
              :list="'value-suggestions'"
              autocomplete="off"
              :aria-invalid="valueError(f) !== null"
              :aria-describedby="valueError(f) !== null ? `f${i}-value-err` : undefined"
              @input="onText(i, 'value', $event)"
            />
            <p v-if="valueError(f)" :id="`f${i}-value-err`" class="error-text" role="alert">
              {{ valueError(f) }}
            </p>
            <ValuePreview :value="f.value" :variables="variables" :example-url="exampleUrl" />
          </div>
        </div>

        <details class="advanced">
          <summary>Avançado</summary>
          <div class="control">
            <label :for="`f${i}-default`">Valor padrão (opcional)</label>
            <input
              :id="`f${i}-default`"
              class="f-default"
              type="text"
              :value="f.defaultValue"
              @input="onText(i, 'defaultValue', $event)"
            />
            <p class="hint">
              Se o sistema já preenche o campo com um valor fixo, informe-o aqui para a regra
              tratá-lo como “vazio”.
            </p>
          </div>
        </details>
        <p v-for="e in otherErrors(f)" :key="e" class="error-text">{{ e }}</p>
      </li>
    </ol>

    <button type="button" class="btn" data-testid="add-field" @click="add">Adicionar campo</button>
  </fieldset>
</template>
