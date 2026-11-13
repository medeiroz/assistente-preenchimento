import type { RunReport } from '../model';
import type { HistoryRepository } from './types';
import type { StorageAreaLike } from './chrome-sync';

export const HISTORY_KEY = 'history';
export const HISTORY_MAX = 50;

export interface ChromeHistoryDeps {
  local: StorageAreaLike;
}

export function createChromeHistoryRepository(deps: ChromeHistoryDeps): HistoryRepository {
  const { local } = deps;
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<RunReport[]> {
    const got = await local.get(HISTORY_KEY);
    const v = got[HISTORY_KEY];
    return Array.isArray(v) ? (v as RunReport[]) : [];
  }

  return {
    append(r) {
      const run = queue.then(async () => {
        const list = await read();
        await local.set({ [HISTORY_KEY]: [r, ...list].slice(0, HISTORY_MAX) });
      });
      queue = run.catch(() => undefined);
      return run;
    },
    async list(limit) {
      const list = await read();
      return limit === undefined ? list : list.slice(0, limit);
    },
    clear() {
      return local.remove(HISTORY_KEY);
    },
  };
}

export function chromeHistoryRepository(): HistoryRepository {
  return createChromeHistoryRepository({
    local: browser.storage.local as unknown as StorageAreaLike,
  });
}
