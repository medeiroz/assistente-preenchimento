import { buildCapture, locate, resolveField } from '../../../src/core/locator';
import { createRecorder } from '../../../src/entrypoints/content/recorder';

declare global {
  interface Window {
    __perf: {
      buildCapture: typeof buildCapture;
      locate: typeof locate;
      resolveField: typeof resolveField;
      createRecorder: typeof createRecorder;
    };
  }
}

window.__perf = { buildCapture, locate, resolveField, createRecorder };
