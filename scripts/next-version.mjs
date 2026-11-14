// Calcula a versão da próxima release.
// - Se a versão do package.json ainda não tem tag vX.Y.Z, usa essa versão.
// - Senão, usa o próximo patch da MAIOR tag vX.Y.Z existente.
// Uso: node scripts/next-version.mjs   (imprime a versão; lê package.json e `git tag`)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** @param {string} v @returns {[number, number, number]} */
function parse(v) {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`Versão inválida: "${v}" (esperado X.Y.Z)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** @param {string} a @param {string} b */
function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * @param {string} pkgVersion versão atual do package.json (X.Y.Z)
 * @param {string[]} tags tags existentes (só as no formato vX.Y.Z contam)
 * @returns {string}
 */
export function nextVersion(pkgVersion, tags) {
  parse(pkgVersion);
  const versions = tags
    .map((t) => t.trim())
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => t.slice(1));
  if (!versions.includes(pkgVersion)) return pkgVersion;
  const highest = versions.reduce((max, v) => (compare(v, max) > 0 ? v : max));
  const [major, minor, patch] = parse(highest);
  return `${major}.${minor}.${patch + 1}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n');
  console.log(nextVersion(pkg.version, tags));
}
