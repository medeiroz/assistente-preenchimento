import { build } from 'esbuild';
import path from 'node:path';

const entry = path.resolve(import.meta.dirname, '../harness/libs-entry.js');

let cached: Promise<string> | undefined;

/**
 * Empacota React + React-Select + jQuery + Select2 para a página libs.html do harness.
 * Só o harness importa essas bibliotecas (devDependencies); nada disso entra na extensão.
 */
export function bundleLibs(): Promise<string> {
  cached ??= build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then((result) => {
    const out = result.outputFiles[0];
    if (!out) throw new Error('esbuild não gerou saída');
    return out.text;
  });
  return cached;
}
