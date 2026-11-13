import { createController, type Controller } from '../../core/engine';
import { parseRule, type Rule } from '../../core/model';
import { isMessage } from '../../shared/messages';
import ceNfse from '../../../presets/ce-nfse.json';
import { createPageUi } from './page-ui';

const E2E = import.meta.env.MODE === 'e2e';

function parsePresets(raw: unknown[]): Rule[] {
  const rules: Rule[] = [];
  for (const item of raw) {
    const r = parseRule(item);
    if (r.ok) rules.push(r.rule);
    else console.warn('[assistente] preset inválido descartado:', r.errors.join('; '));
  }
  return rules;
}

async function loadRules(): Promise<Rule[]> {
  const raw: unknown[] = [ceNfse];
  if (E2E) raw.push((await import('../../../presets/e2e-harness.json')).default);
  return parsePresets(raw);
}

export default defineContentScript({
  matches: E2E
    ? ['https://app.clinicaexperts.com.br/*', 'http://localhost/*', 'http://127.0.0.1/*']
    : ['https://app.clinicaexperts.com.br/*'],
  async main() {
    const controller: Controller = createController({
      window,
      rules: await loadRules(),
      ui: createPageUi(),
    });
    controller.start();

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!isMessage(message)) return false;
      if (message.type === 'run/now') {
        controller.runNow(message.payload.ruleId).then(sendResponse);
        return true;
      }
      if (message.type === 'run/last-report') {
        sendResponse(controller.lastReport());
      }
      return false;
    });
  },
});
