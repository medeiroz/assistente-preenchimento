import { computed, ref } from 'vue';
import type { RunReport } from '../../../core/model';
import { ReadOnlyConfigError, chromeSyncRepository } from '../../../core/storage';
import { hasFilled } from '../lib/outcome';
import { togglePausedHost } from '../lib/pause';
import {
  latestReport,
  sendToFrames,
  stateFromAggregate,
  stateFromTopStatus,
  type PopupState,
  type PopupStatus,
} from '../lib/frames';
import { askFrames, resolveTabId, sendToFrame } from '../lib/tab';

export type View = 'loading' | 'unavailable' | 'ready';

/** Estado compartilhado da aba atual: status, relatório, ocupado e erro. */
export function useTabContext() {
  const view = ref<View>('loading');
  const status = ref<PopupStatus | null>(null);
  const report = ref<RunReport | null>(null);
  const busy = ref(false);
  const error = ref('');
  const tab: { id: number | null; url: string | undefined } = { id: null, url: undefined };

  /** Frames que recebem "Preencher agora" e "Desfazer" (os que têm regra ativa). */
  let targets: number[] = [0];

  const repo = chromeSyncRepository();
  const active = computed(() => status.value !== null && !status.value.paused);
  const canUndo = computed(() => hasFilled(report.value));

  /**
   * Estado agregado dos frames (background). Sem nada registrado, cai no caminho antigo: o
   * `tab/status` do frame de topo.
   */
  async function loadState(id: number): Promise<PopupState> {
    const agg = await askFrames(id).catch(() => null);
    const state = agg ? stateFromAggregate(agg) : null;
    if (state) return state;
    return stateFromTopStatus(await sendToFrame(id, 0, { type: 'tab/status' }));
  }

  /** Resolve a aba e o status; `onTab` roda logo após resolver a aba (antes do status). */
  async function load(onTab: (id: number) => void): Promise<void> {
    try {
      tab.id = await resolveTabId();
      if (tab.id === null) throw new Error('sem aba');
      onTab(tab.id);
      const state = await loadState(tab.id);
      status.value = state.status;
      targets = state.targets;
      // O registro pode estar um instante atrasado: o relatório vivo dos frames vale mais.
      report.value = latestReport([state.report, await lastReport(tab.id).catch(() => null)]);
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

  /** Os frames com regra podem ter mudado desde que o popup abriu (ex.: o modal apareceu). */
  async function refreshTargets(id: number): Promise<void> {
    const agg = await askFrames(id).catch(() => null);
    const state = agg ? stateFromAggregate(agg) : null;
    if (state) targets = state.targets;
  }

  async function lastReport(id: number): Promise<RunReport | null> {
    const all = await Promise.all(
      (targets.length > 0 ? targets : [0]).map((f) =>
        sendToFrame(id, f, { type: 'run/last-report' }).catch(() => null),
      ),
    );
    return latestReport(all);
  }

  async function runNow(): Promise<void> {
    if (tab.id === null || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      const id = tab.id;
      await refreshTargets(id);
      const results = await sendToFrames(targets, (f) =>
        sendToFrame(id, f, { type: 'run/now', payload: {} }, 10000),
      );
      const reports = results.flat();
      report.value = latestReport(reports) ?? (await lastReport(id));
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
      const id = tab.id;
      await refreshTargets(id);
      await sendToFrames(targets, (f) =>
        sendToFrame(id, f, { type: 'run/undo', payload: {} }, 10000),
      );
      report.value = await lastReport(id);
    } catch {
      error.value = 'A página não respondeu. Tente novamente.';
    } finally {
      busy.value = false;
    }
  }

  return { view, status, report, busy, error, tab, active, canUndo, load, setActive, runNow, undo };
}

export type TabContext = ReturnType<typeof useTabContext>;
