import { parseRule, type Rule } from '../core/model';
import { chromeSyncRepository, seedIfEmpty } from '../core/storage';
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

export default defineBackground(() => {
  console.info('[assistente] service worker iniciado');
  const run = (): void => {
    seed().catch((e: unknown) => console.warn('[assistente] falha ao semear presets', e));
  };
  browser.runtime.onInstalled.addListener((d) => {
    if (d.reason === 'install') run();
  });
  run();
});
