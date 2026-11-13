import { parseRule, type Rule } from '../core/model';
import { chromeSyncRepository, seedIfEmpty } from '../core/storage';
import { syncDynamicScripts, type DynamicSyncDeps } from '../shared/permissions';
import ceNfse from '../../presets/ce-nfse.json';

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

async function seed(): Promise<void> {
  const raw: unknown[] = [ceNfse];
  if (E2E) raw.push((await import('../../presets/e2e-harness.json')).default);
  await seedIfEmpty(chromeSyncRepository(), parsePresets(raw));
}

/** Mesmo arquivo do content script estático gerado pelo WXT (ex.: content-scripts/content.js). */
function contentScriptFile(): string {
  const manifest = browser.runtime.getManifest();
  return manifest.content_scripts?.[0]?.js?.[0] ?? 'content-scripts/content.js';
}

function dynamicDeps(): DynamicSyncDeps {
  const repo = chromeSyncRepository();
  return {
    api: browser,
    loadRules: async () => (await repo.load()).rules,
    scriptFile: contentScriptFile(),
  };
}

// Serializa as sincronizações: register concorrente falharia com "id duplicado".
let syncChain: Promise<unknown> = Promise.resolve();
function scheduleSync(): void {
  syncChain = syncChain.then(() => syncDynamicScripts(dynamicDeps()));
}

export default defineBackground(() => {
  console.info('[assistente] service worker iniciado');
  const run = (): void => {
    seed()
      .catch((e: unknown) => console.warn('[assistente] falha ao semear presets', e))
      .finally(scheduleSync);
  };
  browser.runtime.onInstalled.addListener((d) => {
    if (d.reason === 'install') run();
  });
  chromeSyncRepository().onChange(scheduleSync);
  browser.permissions.onAdded.addListener(scheduleSync);
  browser.permissions.onRemoved.addListener(scheduleSync);
  run();
});
