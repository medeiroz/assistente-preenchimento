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
}

export interface AdapterRegistry {
  register(adapter: FieldAdapter, priority: number): void; // maior prioridade é testada primeiro no 'auto'
  resolve(root: Element, requested: 'auto' | AdapterId): FieldAdapter | null;
  list(): readonly FieldAdapter[];
}
