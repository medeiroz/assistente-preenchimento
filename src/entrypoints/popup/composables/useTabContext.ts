import { computed, ref } from 'vue';
import type { RunReport } from '../../../core/model';
import { ReadOnlyConfigError, chromeSyncRepository } from '../../../core/storage';
import type { TabStatus } from '../../../shared/messages';
import { hasFilled } from '../lib/outcome';
import { togglePausedHost } from '../lib/pause';
import { resolveTabId, sendToTab } from '../lib/tab';

export type View = 'loading' | 'unavailable' | 'ready';

/** Estado compartilhado da aba atual: status, relatório, ocupado e erro. */
export function useTabContext() {
  const view = ref<View>('loading');
  const status = ref<TabStatus | null>(null);
  const report = ref<RunReport | null>(null);
  const busy = ref(false);
  const error = ref('');
  const tab: { id: number | null; url: string | undefined } = { id: null, url: undefined };

  const repo = chromeSyncRepository();
  const active = computed(() => status.value !== null && !status.value.paused);
  const canUndo = computed(() => hasFilled(report.value));

  /** Resolve a aba e o status; `onTab` roda logo após resolver a aba (antes do status). */
  async function load(onTab: (id: number) => void): Promise<void> {
    try {
      tab.id = await resolveTabId();
      if (tab.id === null) throw new Error('sem aba');
      onTab(tab.id);
      const s = await sendToTab(tab.id, { type: 'tab/status' });
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
    } catch (e) {
      error.value =
        e instanceof ReadOnlyConfigError ? e.message : 'Não foi possível salvar a preferência.';
    }
  }

  function lastReport(id: number): Promise<RunReport | null> {
    return sendToTab(id, { type: 'run/last-report' });
  }

  async function runNow(): Promise<void> {
    if (tab.id === null || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      const reports = await sendToTab(tab.id, { type: 'run/now', payload: {} }, 10000);
      report.value = reports.length > 0 ? reports[reports.length - 1]! : await lastReport(tab.id);
    } catch {
      error.value = 'A página não respondeu. Tente novamente.';
    } finally {
      busy.value = false;
    }
  }

  async function undo(): Promise<void> {
    if (tab.id === null || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      await sendToTab(tab.id, { type: 'run/undo', payload: {} }, 10000);
      report.value = await lastReport(tab.id);
    } catch {
      error.value = 'A página não respondeu. Tente novamente.';
    } finally {
      busy.value = false;
    }
  }

  return { view, status, report, busy, error, tab, active, canUndo, load, setActive, runNow, undo };
}

export type TabContext = ReturnType<typeof useTabContext>;
