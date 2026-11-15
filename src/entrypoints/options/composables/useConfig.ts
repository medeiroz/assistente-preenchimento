import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { emptyConfig, type Config } from '../../../core/model';
import { chromeSyncRepository } from '../../../core/storage';
import type { ConfigRepository } from '../../../core/storage';

export interface UseConfig {
  repo: ConfigRepository;
  config: Ref<Config>;
  loaded: Ref<boolean>;
  loadError: Ref<string | null>;
  /** Configuração salva por uma versão mais nova da extensão: só leitura. */
  readOnly: Ref<boolean>;
  reload(): Promise<void>;
}

/** Carrega a configuração e a mantém atualizada quando ela muda em outra aba ou dispositivo. */
export function useConfig(repo: ConfigRepository = chromeSyncRepository()): UseConfig {
  const config = ref<Config>(emptyConfig());
  const loaded = ref(false);
  const loadError = ref<string | null>(null);
  const readOnly = ref(false);
  let off: (() => void) | undefined;

  async function reload(): Promise<void> {
    try {
      config.value = await repo.load();
      readOnly.value = await repo.isReadOnly();
      loadError.value = null;
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e);
    } finally {
      loaded.value = true;
    }
  }

  onMounted(() => {
    void reload();
    off = repo.onChange((c, state) => {
      config.value = c;
      readOnly.value = state.readOnly;
      loaded.value = true;
    });
  });
  onUnmounted(() => off?.());

  return { repo, config, loaded, loadError, readOnly, reload };
}
