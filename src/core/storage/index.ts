export type { Unsubscribe, ConfigRepository, HistoryRepository } from './types';
export {
  createChromeSyncRepository,
  chromeSyncRepository,
  chromeSyncDeps,
  seedIfEmpty,
  StorageQuotaError,
  ReadOnlyConfigError,
  MAX_ITEM_BYTES,
} from './chrome-sync';
export type {
  StorageAreaLike,
  StorageChanges,
  ChromeSyncDeps,
  ChromeSyncRepository,
} from './chrome-sync';
export {
  createChromeHistoryRepository,
  chromeHistoryRepository,
  HISTORY_KEY,
  HISTORY_MAX,
} from './chrome-history';
