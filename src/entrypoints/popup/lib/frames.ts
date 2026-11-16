import type { RunReport } from '../../../core/model';
import type { TabStatus, TabStatusAggregate } from '../../../shared/messages';

/** Regra ativa vista pelo popup, com o frame onde ela roda (0 = topo). */
export type PopupRule = TabStatus['activeRules'][number] & { frameId: number };

export type PopupStatus = Omit<TabStatus, 'activeRules'> & { activeRules: PopupRule[] };

export interface PopupState {
  status: PopupStatus;
  report: RunReport | null;
  /** Frames com regras ativas: para onde vão "Preencher agora" e "Desfazer". */
  targets: number[];
}

/** Relatório mais recente entre os frames (`startedAt` é ISO, então compara como texto). */
export function latestReport(reports: readonly (RunReport | null)[]): RunReport | null {
  let best: RunReport | null = null;
  for (const r of reports) if (r && (!best || r.startedAt >= best.startedAt)) best = r;
  return best;
}

/** Estado do popup a partir do que o background registrou. Null se não há frame registrado. */
export function stateFromAggregate(agg: TabStatusAggregate): PopupState | null {
  if (agg.frames.length === 0) return null;
  const report = latestReport(agg.frames.map((f) => f.lastReport));
  return {
    status: {
      host: agg.host,
      paused: agg.paused,
      activeRules: agg.frames.flatMap((f) =>
        f.activeRules.map((r) => ({ ...r, frameId: f.frameId })),
      ),
      lastReport: report,
    },
    report,
    targets: agg.frames.filter((f) => f.activeRules.length > 0).map((f) => f.frameId),
  };
}

/** Estado do caminho antigo: `tab/status` respondido pelo frame de topo. */
export function stateFromTopStatus(s: TabStatus): PopupState {
  return {
    status: { ...s, activeRules: s.activeRules.map((r) => ({ ...r, frameId: 0 })) },
    report: s.lastReport,
    targets: [0],
  };
}

/** Envia a mesma mensagem a cada frame; falha só se TODOS falharem. */
export async function sendToFrames<T>(
  frameIds: readonly number[],
  send: (frameId: number) => Promise<T>,
): Promise<T[]> {
  const results = await Promise.allSettled(frameIds.map((id) => send(id)));
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (ok.length === 0 && results.length > 0) {
    const first = results.find((r) => r.status === 'rejected');
    throw first?.status === 'rejected' ? first.reason : new Error('sem frames');
  }
  return ok;
}
