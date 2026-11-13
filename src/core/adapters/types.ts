import type { AdapterId } from '../model';

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly code: 'option-not-found' | 'control-not-found' | 'write-failed' | 'verify-failed',
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface FieldAdapter {
  readonly id: AdapterId;
  /** root = raiz do campo retornada pelo locator (ex.: .eui-field) */
  detect(root: Element): boolean;
  read(root: Element): string | null;
  isDefault(root: Element, defaultValue?: string): boolean;
  write(root: Element, value: string): Promise<void>; // lança AdapterError
  verify(root: Element, value: string): boolean;
  /**
   * OPCIONAL. Deixa o campo sem valor (usado pelo "Desfazer" quando não havia valor anterior).
   * Opcional para não quebrar implementações existentes: adaptadores que não conseguem
   * limpar com segurança (radios, toggles) simplesmente não o implementam. Nunca usa teclado.
   * Lança AdapterError('write-failed') se não for possível limpar.
   */
  clear?(root: Element): Promise<void>;
}

export interface AdapterRegistry {
  register(adapter: FieldAdapter, priority: number): void; // maior prioridade é testada primeiro no 'auto'
  resolve(root: Element, requested: 'auto' | AdapterId): FieldAdapter | null;
  list(): readonly FieldAdapter[];
}
