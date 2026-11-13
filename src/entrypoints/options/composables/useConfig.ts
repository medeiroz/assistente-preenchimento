import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { emptyConfig, type Config } from '../../../core/model';
import { chromeSyncRepository } from '../../../core/storage';
import type { ConfigRepository } from '../../../core/storage';

export interface UseConfig {
  repo: ConfigRepository;
  config: Ref<Config>;
  loaded: Ref<boolean>;
  loadError: Ref<string | null>;
  reload(): Promise<void>;
}

/** Carrega a configuração e a mantém atualizada quando ela muda em outra aba ou dispositivo. */
export function useConfig(repo: ConfigRepository = chromeSyncRepository()): UseConfig {
  const config = ref<Config>(emptyConfig());
  const loaded = ref(false);
  const loadError = ref<string | null>(null);
  let off: (() => void) | undefined;

  async function reload(): Promise<void> {
    try {
      config.value = await repo.load();
      loadError.value = null;
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e);
    } finally {
      loaded.value = true;
    }
  }

  onMounted(() => {
    void reload();
    off = repo.onChange((c) => {
      config.value = c;
      loaded.value = true;
    });
  });
  onUnmounted(() => off?.());

  return { repo, config, loaded, loadError, reload };
}
