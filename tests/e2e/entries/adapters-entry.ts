import {
  createDefaultRegistry,
  dateAdapter,
  nativeChoiceAdapter,
  nativeSelectAdapter,
  nativeTextAdapter,
  vueMultiselectAdapter,
} from '../../../src/core/adapters';

declare global {
  interface Window {
    __adapters: {
      registry: ReturnType<typeof createDefaultRegistry>;
      nativeTextAdapter: typeof nativeTextAdapter;
      vueMultiselectAdapter: typeof vueMultiselectAdapter;
      nativeSelectAdapter: typeof nativeSelectAdapter;
      nativeChoiceAdapter: typeof nativeChoiceAdapter;
      dateAdapter: typeof dateAdapter;
    };
  }
}

window.__adapters = {
  registry: createDefaultRegistry(),
  nativeTextAdapter,
  vueMultiselectAdapter,
  nativeSelectAdapter,
  nativeChoiceAdapter,
  dateAdapter,
};
