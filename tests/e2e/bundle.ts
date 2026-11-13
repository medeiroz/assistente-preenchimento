import { build } from 'esbuild';
import path from 'node:path';

const entry = path.resolve(import.meta.dirname, 'entries/adapters-entry.ts');

let cached: Promise<string> | undefined;

/** Empacota o entry dos adaptadores como IIFE para injeção via page.addScriptTag. */
export function bundleAdapters(): Promise<string> {
  cached ??= build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
    logLevel: 'silent',
  }).then((result) => {
    const out = result.outputFiles[0];
    if (!out) throw new Error('esbuild não gerou saída');
    return out.text;
  });
  return cached;
}
