<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import type { RunReport } from '../../core/model';
import { chromeSyncRepository } from '../../core/storage';
import type { TabStatus } from '../../shared/messages';
import ReportList from './components/ReportList.vue';
import RuleList from './components/RuleList.vue';
import { hasFilled } from './lib/outcome';
import { togglePausedHost } from './lib/pause';
import { resolveTabId, sendToTab } from './lib/tab';

type View = 'loading' | 'unavailable' | 'ready';

const view = ref<View>('loading');
const status = ref<TabStatus | null>(null);
const report = ref<RunReport | null>(null);
const busy = ref(false);
const error = ref('');
let tabId: number | null = null;

const repo = chromeSyncRepository();
const active = computed(() => status.value !== null && !status.value.paused);
const canUndo = computed(() => hasFilled(report.value));

async function load(): Promise<void> {
  try {
    tabId = await resolveTabId();
    if (tabId === null) throw new Error('sem aba');
    const s = await sendToTab(tabId, { type: 'tab/status' });
    status.value = s;
    report.value = s.lastReport;
    view.value = 'ready';
  } catch {
    view.value = 'unavailable';
  }
}

async function setActive(on: boolean): Promise<void> {
  if (!status.value) return;
  error.value = '';
  try {
    const config = await repo.load();
    await repo.saveSettings(togglePausedHost(config.settings, status.value.host, !on));
    status.value = { ...status.value, paused: !on };
  } catch {
    error.value = 'Não foi possível salvar a preferência.';
  }
}

async function runNow(): Promise<void> {
  if (tabId === null || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const reports = await sendToTab(tabId, { type: 'run/now', payload: {} }, 10000);
    report.value = reports.length > 0 ? reports[reports.length - 1]! : await lastReport(tabId);
  } catch {
    error.value = 'A página não respondeu. Tente novamente.';
  } finally {
    busy.value = false;
  }
}

async function undo(): Promise<void> {
  if (tabId === null || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await sendToTab(tabId, { type: 'run/undo', payload: {} }, 10000);
    report.value = await lastReport(tabId);
  } catch {
    error.value = 'A página não respondeu. Tente novamente.';
  } finally {
    busy.value = false;
  }
}

function lastReport(id: number): Promise<RunReport | null> {
  return sendToTab(id, { type: 'run/last-report' });
}

async function startCapture(): Promise<void> {
  if (tabId === null || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await sendToTab(tabId, { type: 'picker/start' });
    window.close(); // o popup fecha para o usuário clicar no campo da página
  } catch {
    error.value = 'A página não respondeu. Tente novamente.';
  } finally {
    busy.value = false;
  }
}

function openSettings(): void {
  void browser.runtime.openOptionsPage();
}

onMounted(load);
</script>

<template>
  <main>
    <header>
      <h1>Assistente de Preenchimento</h1>
      <p v-if="status" class="host" data-testid="host">{{ status.host }}</p>
    </header>

    <p v-if="view === 'loading'" class="muted" role="status">Carregando…</p>

    <section v-else-if="view === 'unavailable'" class="empty" data-testid="unavailable">
      <p>A extensão não atua nesta página</p>
      <button type="button" class="btn" @click="openSettings">Abrir configurações</button>
    </section>

    <template v-else-if="status">
      <label class="switch">
        <input
          type="checkbox"
          role="switch"
          :checked="active"
          @change="setActive(($event.target as HTMLInputElement).checked)"
        />
        <span>Ativo neste site</span>
      </label>
      <p v-if="status.paused" class="paused" role="status" data-testid="paused">
        Pausado neste site
      </p>

      <RuleList :rules="status.activeRules" />

      <ReportList v-if="report" :report="report" />
      <p v-else class="muted" data-testid="no-report">Nenhum relatório ainda nesta página.</p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn primary" :disabled="busy || status.paused" @click="runNow">
          Preencher agora
        </button>
        <button type="button" class="btn" :disabled="busy || !canUndo" @click="undo">
          Desfazer
        </button>
        <button
          type="button"
          class="btn"
          data-testid="capture-field"
          :disabled="busy"
          @click="startCapture"
        >
          Capturar campo
        </button>
        <button type="button" class="btn" @click="openSettings">Configurações</button>
      </div>
    </template>
  </main>
</template>

<style>
:root {
  --bg: #fff;
  --fg: #1c2024;
  --muted: #5f6b76;
  --line: #dde2e7;
  --accent: #1d5fd1;
  --accent-fg: #fff;
  --ok: #17803d;
  --warn: #a86400;
  --err: #c0292b;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16191d;
    --fg: #e8ebee;
    --muted: #9aa5b1;
    --line: #2d333a;
    --accent: #6ea2ff;
    --accent-fg: #0b1220;
    --ok: #4cc27a;
    --warn: #e8a53b;
    --err: #ff7b7d;
  }
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font:
    14px/1.4 system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
}
main {
  width: 360px;
  box-sizing: border-box;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h1 {
  font-size: 16px;
  margin: 0;
}
h2 {
  font-size: 13px;
  margin: 0 0 4px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
p {
  margin: 0;
}
.host,
.muted {
  color: var(--muted);
}
.empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.paused {
  color: var(--warn);
  font-weight: 600;
}
.error {
  color: var(--err);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rules li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--line);
}
.badge {
  color: var(--muted);
  white-space: nowrap;
}
.summary {
  font-weight: 600;
  margin-bottom: 6px;
}
.fields {
  max-height: 180px;
  overflow: auto;
}
.fields li {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--line);
}
.fields .body {
  display: flex;
  flex-direction: column;
}
.fields .icon {
  width: 16px;
  text-align: center;
  font-weight: 700;
}
.tone-ok {
  color: var(--ok);
}
.tone-warn {
  color: var(--warn);
}
.tone-error {
  color: var(--err);
}
.tone-neutral {
  color: var(--muted);
}
.fields .desc {
  color: var(--fg);
}
.fields .msg {
  font-size: 12px;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn {
  font: inherit;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--fg);
  cursor: pointer;
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
