import { createController, type Controller } from '../../core/engine';
import type { Config, RunReport } from '../../core/model';
import { chromeHistoryRepository, chromeSyncRepository } from '../../core/storage';
import { isMessage, type TabStatus } from '../../shared/messages';
import { createPageUi } from './page-ui';
import { claimPage } from './guard';
import { createPicker, deliverCapture } from './picker';

const E2E = import.meta.env.MODE === 'e2e';

function varsOf(config: Config): Record<string, string> {
  return Object.fromEntries(config.variables.map((v) => [v.key, v.value]));
}

export default defineContentScript({
  // Produção: sem matches estáticos. O arquivo é gerado, mas não declarado no manifest; o
  // background o registra por site (permissão concedida) e o popup o injeta sob demanda.
  // Build e2e: declarado no manifest para localhost/127.0.0.1 (harness) e o site de exemplo.
  matches: E2E
    ? ['https://app.clinicaexperts.com.br/*', 'http://localhost/*', 'http://127.0.0.1/*']
    : [],
  registration: E2E ? 'manifest' : 'runtime',
  async main() {
    // Registro dinâmico + injeção sob demanda podem executar o script duas vezes na mesma página.
    if (!claimPage(globalThis)) return;
    const repo = chromeSyncRepository();
    const history = chromeHistoryRepository();
    const host = location.hostname;
    let config = await repo.load();

    const controller: Controller = createController({
      window,
      rules: config.rules,
      variables: varsOf(config),
      ui: createPageUi(),
      onReport: (r: RunReport) => {
        history.append(r).catch((e: unknown) => console.warn('[assistente] histórico', e));
      },
    });

    const picker = createPicker({
      trustedOnly: true,
      onCapture: (capture) => {
        deliverCapture(capture, {
          storage: browser.storage.local,
          sendMessage: (m) => browser.runtime.sendMessage(m),
        }).catch((e: unknown) => console.warn('[assistente] falha ao entregar a captura', e));
      },
    });

    const isPaused = (): boolean => config.settings.pausedHosts.includes(host);
    let started = false;
    function applyPause(): void {
      const paused = isPaused();
      if (paused && started) {
        controller.stop();
        started = false;
      } else if (!paused && !started) {
        controller.start();
        started = true;
      }
    }
    applyPause();

    repo.onChange((next) => {
      config = next;
      controller.setVariables(varsOf(next));
      controller.setRules(next.rules);
      applyPause();
    });

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!isMessage(message)) return false;
      switch (message.type) {
        case 'run/now':
          controller.runNow(message.payload.ruleId).then(sendResponse);
          return true;
        case 'run/undo':
          controller.undo(message.payload.ruleId).then(sendResponse);
          return true;
        case 'run/last-report':
          sendResponse(controller.lastReport());
          return false;
        case 'tab/status': {
          const status: TabStatus = {
            host,
            paused: isPaused(),
            activeRules: controller.activeRules().map((r) => ({
              id: r.id,
              name: r.name,
              mode: r.behavior.mode,
            })),
            lastReport: controller.lastReport(),
          };
          sendResponse(status);
          return false;
        }
        case 'picker/start':
          picker.start();
          sendResponse(undefined);
          return false;
        default:
          return false;
      }
    });
  },
});
