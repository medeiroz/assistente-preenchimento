import { watch, type Ref } from 'vue';

/** Resolve quando a configuração termina de carregar (imediatamente se já carregou). */
export function untilLoaded(loaded: Ref<boolean>): Promise<void> {
  if (loaded.value) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(loaded, (v) => {
      if (!v) return;
      stop();
      resolve();
    });
  });
}
