import type { AdapterId } from '../model';
import type { AdapterRegistry, FieldAdapter } from './types';
import { nativeTextAdapter } from './native-text';
import { vueMultiselectAdapter } from './vue-multiselect';

export function createAdapterRegistry(): AdapterRegistry {
  const entries: { adapter: FieldAdapter; priority: number; order: number }[] = [];
  const sorted = () => [...entries].sort((a, b) => b.priority - a.priority || a.order - b.order);
  return {
    register(adapter, priority) {
      entries.push({ adapter, priority, order: entries.length });
    },
    resolve(root: Element, requested: 'auto' | AdapterId) {
      for (const { adapter } of sorted()) {
        if (requested !== 'auto' && adapter.id !== requested) continue;
        if (adapter.detect(root)) return adapter;
      }
      return null;
    },
    list: () => sorted().map((e) => e.adapter),
  };
}

export function createDefaultRegistry(): AdapterRegistry {
  const registry = createAdapterRegistry();
  registry.register(vueMultiselectAdapter, 100);
  registry.register(nativeTextAdapter, 10);
  return registry;
}
