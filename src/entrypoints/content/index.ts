import { createController, frameUrlOf, type Controller } from '../../core/engine';
import { topHostOf, topOriginOf } from '../../core/frames';
import type { Config, RunReport } from '../../core/model';
import { chromeHistoryRepository, chromeSyncRepository } from '../../core/storage';
import { isMessage, type TabStatus } from '../../shared/messages';
import { createFrameReporter, createRelayedUi, createTopRelay } from './frames';
import { createPageUi } from './page-ui';
import { claimPage } from './guard';
import { initI18n } from '../../shared/i18n';
import { createPicker, deliverCapture } from './picker';
import { createRecorder } from './recorder';
import { trackContextTarget } from './context-target';
import { buildCapture, type Capture } from '../../core/locator';
import type { RecorderStatus } from '../../core/recorder/types';

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
  // Só o build de testes declara o script no manifest: lá ele roda em todos os frames (o motor
  // decide por regra). Em produção o registro dinâmico define allFrames (shared/permissions.ts).
  allFrames: E2E,
  matchOriginAsFallback: E2E,
  async main() {
    // Registro dinâmico + injeção sob demanda podem executar o script duas vezes na mesma página.
    if (!claimPage(globalThis)) return;
    initI18n();
    // A gravação retoma antes do carregamento da configuração: picker, gravador e o ouvinte de
    // `recorder/state` não dependem dela, e o estado é pedido ao background logo em seguida.
    const isTop = window === window.top;
    // Avisa os outros frames da aba que a captura acabou (cada frame tem o próprio picker).
    const stopPickers = (): void => {
      browser.runtime
        .sendMessage({ type: 'picker/stop' })
        .catch((e: unknown) => console.warn('[assistente] falha ao encerrar a captura', e));
    };
    const deliver = (capture: Capture): void => {
      // Capturado num iframe: a regra nasce atuando em iframes.
      const out = isTop ? capture : { ...capture, frames: 'all' as const };
      deliverCapture(out, {
        storage: browser.storage.local,
        sendMessage: (m) => browser.runtime.sendMessage(m),
      }).catch((e: unknown) => console.warn('[assistente] falha ao entregar a captura', e));
    };
    const picker = createPicker({
      trustedOnly: true,
      compact: !isTop,
      onCapture: (capture) => {
        deliver(capture);
        stopPickers();
      },
      onCancel: stopPickers,
    });
    const contextTarget = trackContextTarget(window);

    // A gravação vive só no frame de topo.
    const recorder = isTop
      ? createRecorder({
          isPaused: () => picker.active,
          send: (field) =>
            browser.runtime.sendMessage({
              type: 'recorder/field',
              payload: { field },
            }) as Promise<RecorderStatus>,
          onStop: (discard) => {
            browser.runtime
              .sendMessage({ type: 'recorder/stop', payload: { discard } })
              .catch((e: unknown) => console.warn('[assistente] falha ao encerrar a gravação', e));
          },
        })
      : null;

    if (recorder) {
      browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
        if (!isMessage(message) || message.type !== 'recorder/state') return false;
        recorder.update(message.payload);
        sendResponse(undefined);
        return false;
      });

      // Retoma a gravação depois de uma navegação completa (o background pode estar dormindo).
      (
        browser.runtime.sendMessage({ type: 'recorder/status', payload: {} }) as Promise<
          RecorderStatus | undefined
        >
      )
        .then((status) => {
          if (status?.active) recorder.start(status);
        })
        .catch(() => {
          // Sem resposta do background: sem gravação a retomar.
        });
    }

    const repo = chromeSyncRepository();
    const history = chromeHistoryRepository();
    // Pausa por site vale pelo host de topo (num iframe, o host do próprio frame é só o último recurso).
    let host = topHostOf(location, isTop);
    let config = await repo.load();

    const pageUi = createPageUi();
    const relayed = isTop ? null : createRelayedUi(pageUi, (m) => browser.runtime.sendMessage(m));
    const topRelay = isTop
      ? createTopRelay(pageUi, (action) => {
          browser.runtime
            .sendMessage({ type: 'ui/action', payload: action })
            .catch((e: unknown) => console.warn('[assistente] falha ao devolver o clique', e));
        })
      : null;

    const reporter = createFrameReporter({
      send: (m) => browser.runtime.sendMessage(m),
      snapshot: () => {
        const topOrigin = isTop ? undefined : topOriginOf(location);
        return {
          url: frameUrlOf(window),
          ...(topOrigin ? { topUrl: topOrigin } : {}),
          activeRules: statusRules(),
          lastReport: controller.lastReport(),
        };
      },
    });
    const statusRules = (): TabStatus['activeRules'] =>
      controller.activeRules().map((r) => ({ id: r.id, name: r.name, mode: r.behavior.mode }));

    const controller: Controller = createController({
      window,
      rules: config.rules,
      variables: varsOf(config),
      ui: relayed ? relayed.ui : pageUi,
      isTopFrame: isTop,
      onStateChange: () => reporter.notify(),
      onReport: (r: RunReport) => {
        history.append(r).catch((e: unknown) => console.warn('[assistente] histórico', e));
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
    // Sem `ancestorOrigins`, o host de topo vem do background (resposta do primeiro `frame/hello`).
    const needsTopFromBackground = !isTop && topOriginOf(location) === undefined;
    if (needsTopFromBackground) host = topHostOf(location, false, (await reporter.hello())?.topUrl);
    applyPause();
    reporter.notify();
    window.addEventListener('pagehide', () => reporter.bye());
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) void reporter.hello();
    });

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
          // O estado da aba inteira vem do background; este caminho é o do frame de topo.
          if (!isTop) return false;
          const status: TabStatus = {
            host,
            paused: isPaused(),
            activeRules: statusRules(),
            lastReport: controller.lastReport(),
          };
          sendResponse(status);
          return false;
        }
        case 'ui/toast':
        case 'ui/button':
        case 'ui/frame-gone':
          topRelay?.handle(message);
          sendResponse(true);
          return false;
        case 'ui/action':
          relayed?.handleAction(message.payload);
          sendResponse(undefined);
          return false;
        case 'picker/stop':
          picker.stop();
          sendResponse(undefined);
          return false;
        case 'picker/capture-target': {
          // Menu de contexto: captura o alvo do último `contextmenu`, como o clique do picker.
          const target = contextTarget.take();
          const capture = target ? buildCapture(target, document, frameUrlOf(window)) : null;
          if (capture) deliver(capture);
          sendResponse(capture !== null);
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
