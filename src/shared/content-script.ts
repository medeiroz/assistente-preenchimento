/** Caminho do content script gerado pelo WXT (entrypoint `content/index.ts`). */
export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

interface ManifestLike {
  content_scripts?: { js?: string[] }[];
}

/** Arquivo do content script: o declarado no manifest (build e2e) ou o caminho padrão do WXT. */
export function contentScriptFile(manifest: ManifestLike): string {
  return manifest.content_scripts?.[0]?.js?.[0] ?? CONTENT_SCRIPT_FILE;
}
