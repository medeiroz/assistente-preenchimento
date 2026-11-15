import type { Config, Rule, RunReport, Settings, Variable } from '../model';

export type Unsubscribe = () => void;

export interface ConfigRepository {
  load(): Promise<Config>;
  /**
   * true se a configuração armazenada foi salva por uma versão mais nova da extensão.
   * Nesse caso `load()` devolve o que foi possível validar e toda escrita lança
   * `ReadOnlyConfigError`, sem tocar no storage.
   */
  isReadOnly(): Promise<boolean>;
  saveRule(rule: Rule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  saveVariables(vars: Variable[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  replaceAll(config: Config): Promise<void>; // import
  onChange(cb: (config: Config, state: { readOnly: boolean }) => void): Unsubscribe;
}

export interface HistoryRepository {
  append(r: RunReport): Promise<void>;
  list(limit?: number): Promise<RunReport[]>;
  clear(): Promise<void>;
}
