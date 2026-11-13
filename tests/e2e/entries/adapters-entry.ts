import {
  createDefaultRegistry,
  nativeTextAdapter,
  vueMultiselectAdapter,
} from '../../../src/core/adapters';

declare global {
  interface Window {
    __adapters: {
      registry: ReturnType<typeof createDefaultRegistry>;
      nativeTextAdapter: typeof nativeTextAdapter;
      vueMultiselectAdapter: typeof vueMultiselectAdapter;
    };
  }
}

window.__adapters = {
  registry: createDefaultRegistry(),
  nativeTextAdapter,
  vueMultiselectAdapter,
};
