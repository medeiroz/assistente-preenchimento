import { AdapterIdSchema, type AdapterRef } from '../model';
import type { AdapterRegistry, FieldAdapter } from './types';
import { nativeTextAdapter } from './native-text';
import { nativeSelectAdapter } from './native-select';
import { nativeChoiceAdapter } from './native-choice';
import { dateAdapter } from './date';
import { vueMultiselectAdapter } from './vue-multiselect';
import { contentEditableAdapter } from './contenteditable';
import { reactSelectAdapter } from './react-select';
import { select2Adapter } from './select2';

export function createAdapterRegistry(): AdapterRegistry {
  const entries: { adapter: FieldAdapter; priority: number; order: number }[] = [];
  const sorted = () => [...entries].sort((a, b) => b.priority - a.priority || a.order - b.order);
  return {
    register(adapter, priority) {
      entries.push({ adapter, priority, order: entries.length });
    },
    resolve(root: Element, requested: AdapterRef) {
      // Id desconhecido (regra de versão futura) vale como 'auto'.
      const known = requested !== 'auto' && AdapterIdSchema.safeParse(requested).success;
      for (const { adapter } of sorted()) {
        if (known && adapter.id !== requested) continue;
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
  registry.register(reactSelectAdapter, 95);
  registry.register(dateAdapter, 90);
  registry.register(select2Adapter, 85);
  registry.register(nativeSelectAdapter, 80);
  registry.register(nativeChoiceAdapter, 70);
  registry.register(contentEditableAdapter, 20);
  registry.register(nativeTextAdapter, 10);
  return registry;
}
