import type { Settings } from '../../../core/model';

/** Devolve novas settings com o host adicionado (paused=true) ou removido (paused=false). */
export function togglePausedHost(settings: Settings, host: string, paused: boolean): Settings {
  const rest = settings.pausedHosts.filter((h) => h !== host);
  return { ...settings, pausedHosts: paused ? [...rest, host] : rest };
}
