import type { Config, Rule, RunReport, Settings, Variable } from '../model';

export type Unsubscribe = () => void;

export interface ConfigRepository {
  load(): Promise<Config>;
  saveRule(rule: Rule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  saveVariables(vars: Variable[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  replaceAll(config: Config): Promise<void>; // import
  onChange(cb: (config: Config) => void): Unsubscribe;
}

export interface HistoryRepository {
  append(r: RunReport): Promise<void>;
  list(limit?: number): Promise<RunReport[]>;
  clear(): Promise<void>;
}
