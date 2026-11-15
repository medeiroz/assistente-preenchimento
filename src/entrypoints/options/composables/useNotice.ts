import { ref } from 'vue';

export interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

/** Aviso temporário (toast) da página de opções: some sozinho depois de 6 s. */
export function useNotice() {
  const notice = ref<Notice | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function showNotice(kind: Notice['kind'], text: string): void {
    notice.value = { kind, text };
    clearTimeout(timer);
    timer = setTimeout(() => (notice.value = null), 6000);
  }

  return { notice, showNotice };
}
