import examplePreset from '../../../../presets/exemplo-cadastro.json';
import { parseAddition, type Addition } from './merge';

/** Regras do exemplo embutido ("Importar exemplo"); null se o arquivo do exemplo for inválido. */
export function exampleAddition(): Addition | null {
  const parsed = parseAddition(JSON.stringify(examplePreset));
  return parsed.ok ? parsed.addition : null;
}
