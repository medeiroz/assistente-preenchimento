import cePreset from '../../../../presets/ce-nfse.json';
import { parseAddition, type Addition } from './merge';

/** Regras do exemplo embutido ("Importar exemplo"); null se o arquivo do exemplo for inválido. */
export function exampleAddition(): Addition | null {
  const parsed = parseAddition(JSON.stringify(cePreset));
  return parsed.ok ? parsed.addition : null;
}
