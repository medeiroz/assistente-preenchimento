import type { Capture } from '../../../src/core/locator';
import type { RecordedField } from '../../../src/core/recorder';

export function cap(label: string, over: Partial<Capture> = {}): Capture {
  return {
    locator: { by: 'label', text: label },
    adapter: 'native-text',
    currentValue: null,
    label,
    urlPattern: 'https://exemplo.test/*',
    ...over,
  };
}

export function field(label: string, value: string, over: Partial<Capture> = {}): RecordedField {
  return { capture: cap(label, over), value, url: 'https://exemplo.test/a', recordedAt: 1 };
}
