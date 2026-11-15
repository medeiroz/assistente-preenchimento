<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { FILTER_NAMES } from '../../../core/expressions';
import type { Variable } from '../../../core/model';
import {
  ADAPTER_OPTIONS,
  LOCATOR_OPTIONS,
  LOCATOR_PLACEHOLDERS,
  DEFAULT_KEY_DELAY_MS,
  adapterLabel,
  adapterSupportsTyping,
  isKnownAdapterChoice,
  dropTarget,
  fieldValueError,
  moveField,
  reorderFields,
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
  /** Campo que recebe o foco (no input de Valor) ao montar, ex.: vindo do "Capturar campo". */
  focusFieldId?: string | null;
  /** Dicas por id de campo, mostradas sob o Valor (ex.: "valor atual na página: …"). */
  hints?: Record<string, string>;
}>();
const emit = defineEmits<{ 'update:fields': [fields: FieldDraft[]] }>();

const root = ref<HTMLElement | null>(null);

onMounted(() => {
  const id = props.focusFieldId;
  if (!id) return;
  void nextTick(() => {
    const card = Array.from(
      root.value?.querySelectorAll<HTMLElement>('[data-field-id]') ?? [],
    ).find((c) => c.dataset.fieldId === id);
    card?.querySelector<HTMLInputElement>('.f-value')?.focus();
  });
});

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
  if (key === 'locatorBy') {
    // As chaves extras do localizador pertencem à variante anterior: não valem na nova.
    patch(index, { locatorBy: v as LocatorBy, locatorExtra: undefined });
    return;
  }
  const adapter = v as AdapterChoice;
  // Adaptadores que não digitam ignorariam a opção: desliga para não enganar.
  patch(index, adapterSupportsTyping(adapter) ? { adapter } : { adapter, typing: false });
}

/** Número de um <input type=number>; vazio vira null (a validação acusa quando obrigatório). */
function numberOf(ev: Event): number | null {
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function onDelay(index: number, ev: Event): void {
  patch(index, { delayMs: numberOf(ev) });
}

function onKeyDelay(index: number, ev: Event): void {
  patch(index, { keyDelayMs: numberOf(ev) });
}

function onTyping(index: number, ev: Event): void {
  const on = (ev.target as HTMLInputElement).checked;
  const f = props.fields[index];
  patch(index, {
    typing: on,
    keyDelayMs: on && (f?.keyDelayMs ?? null) === null ? DEFAULT_KEY_DELAY_MS : f?.keyDelayMs,
  });
}

function delayError(f: FieldDraft): string | null {
  return props.errors[`fields.${f.id}.delay`]?.join('; ') ?? null;
}

function keyDelayError(f: FieldDraft): string | null {
  return props.errors[`fields.${f.id}.keyDelay`]?.join('; ') ?? null;
}

function hasDelay(f: FieldDraft): boolean {
  return f.delayMs !== null && f.delayMs > 0;
}

// ------------------------------------------------ arrastar e soltar
// Só a alça (⠿) é arrastável: os inputs do card continuam selecionáveis/editáveis.
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
const overWhere = ref<'before' | 'after'>('before');

function onDragStart(i: number, ev: DragEvent): void {
  dragIndex.value = i;
  const dt = ev.dataTransfer;
  if (!dt) return;
  dt.effectAllowed = 'move';
  dt.setData('text/plain', props.fields[i]?.id ?? '');
  const card = (ev.currentTarget as HTMLElement).closest('li');
  if (card) dt.setDragImage(card, 12, 12);
}

function onDragOver(i: number, ev: DragEvent): void {
  if (dragIndex.value === null) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  overIndex.value = i;
  overWhere.value = ev.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function onDrop(i: number, ev: DragEvent): void {
  if (dragIndex.value === null) return;
  ev.preventDefault();
  const from = dragIndex.value;
  const to = dropTarget(from, i, overWhere.value);
  onDragEnd();
  if (to !== from) emit('update:fields', reorderFields(props.fields, from, to));
}

function onDragEnd(): void {
  dragIndex.value = null;
  overIndex.value = null;
}

function dropClass(i: number): string {
  if (dragIndex.value === null || overIndex.value !== i) return '';
  // Soltar no mesmo lugar não muda nada: sem indicador.
  if (dropTarget(dragIndex.value, i, overWhere.value) === dragIndex.value) return '';
  return overWhere.value === 'before' ? 'drop-before' : 'drop-after';
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
  <fieldset ref="root" class="panel">
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
      <li
        v-for="(f, i) in fields"
        :key="f.id"
        class="field-card"
        :class="[dropClass(i), { dragging: dragIndex === i }]"
        :data-field-id="f.id"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i, $event)"
      >
        <div class="field-head">
          <span
            class="drag-handle"
            role="button"
            draggable="true"
            aria-label="Arrastar para reordenar"
            title="Arrastar para reordenar"
            data-testid="field-drag"
            @dragstart="onDragStart(i, $event)"
            @dragend="onDragEnd"
            >⠿</span
          >
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
          <span v-if="hasDelay(f)" class="badge" data-testid="field-badge-delay"
            >⏱ {{ f.delayMs }} ms</span
          >
          <span v-if="f.typing" class="badge" data-testid="field-badge-typing">⌨ digitação</span>
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
              <option v-if="!isKnownAdapterChoice(f.adapter)" :value="f.adapter">
                {{ adapterLabel(f.adapter) }}
              </option>
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
            <p v-if="hints?.[f.id]" class="hint" data-testid="value-hint">{{ hints[f.id] }}</p>
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
          <div class="grid">
            <div class="control">
              <label :for="`f${i}-delay`">Esperar antes de preencher (ms)</label>
              <input
                :id="`f${i}-delay`"
                class="f-delay"
                data-testid="field-delay"
                type="number"
                min="0"
                max="60000"
                step="1"
                placeholder="0"
                :value="f.delayMs ?? ''"
                :aria-invalid="delayError(f) !== null"
                :aria-describedby="delayError(f) !== null ? `f${i}-delay-err` : undefined"
                @input="onDelay(i, $event)"
              />
              <p v-if="delayError(f)" :id="`f${i}-delay-err`" class="error-text" role="alert">
                {{ delayError(f) }}
              </p>
            </div>
            <div class="control">
              <label class="inline">
                <input
                  type="checkbox"
                  class="f-typing"
                  data-testid="field-typing"
                  :checked="f.typing"
                  :disabled="!adapterSupportsTyping(f.adapter)"
                  @change="onTyping(i, $event)"
                />
                Simular digitação (tecla por tecla)
              </label>
              <p v-if="!adapterSupportsTyping(f.adapter)" class="hint">
                Disponível só para campos de texto e data.
              </p>
            </div>
            <div v-if="f.typing" class="control">
              <label :for="`f${i}-keydelay`">Intervalo entre teclas (ms)</label>
              <input
                :id="`f${i}-keydelay`"
                class="f-key-delay"
                data-testid="field-key-delay"
                type="number"
                min="0"
                max="2000"
                step="1"
                :value="f.keyDelayMs ?? ''"
                :aria-invalid="keyDelayError(f) !== null"
                :aria-describedby="keyDelayError(f) !== null ? `f${i}-keydelay-err` : undefined"
                @input="onKeyDelay(i, $event)"
              />
              <p v-if="keyDelayError(f)" :id="`f${i}-keydelay-err`" class="error-text" role="alert">
                {{ keyDelayError(f) }}
              </p>
            </div>
          </div>
          <p class="hint">
            Use a digitação simulada em campos com máscara ou busca automática (ex.: CPF/CNPJ que
            consulta um cadastro). A espera é útil quando o campo só aparece ou habilita depois do
            anterior: o campo é procurado só depois dela.
          </p>
        </details>
        <p v-for="e in otherErrors(f)" :key="e" class="error-text">{{ e }}</p>
      </li>
    </ol>

    <button type="button" class="btn" data-testid="add-field" @click="add">Adicionar campo</button>
  </fieldset>
</template>
