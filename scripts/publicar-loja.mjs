// Publica a versão de uma Release em UMA loja (chrome | firefox | edge), sem repetir o que já foi
// enviado. Uso: node scripts/publicar-loja.mjs <loja> <versão>   (ex.: chrome 1.2.3)
//
// Como evita repetir: depois de um envio bem-sucedido anexa à Release do GitHub o arquivo
// `publicado-<loja>.txt`; se ele existir, a loja é pulada. Chrome e Firefox também consultam a
// API da loja (versão já publicada/enviada, ou revisão em andamento). O Edge não tem endpoint de
// consulta, então só vale o marcador.
import { createHmac, createSign, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const LOJAS = {
  chrome: {
    nome: 'Chrome Web Store',
    env: [
      'CHROME_EXTENSION_ID',
      'CHROME_PUBLISHER_ID',
      'CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL',
      'CHROME_SERVICE_ACCOUNT_PRIVATE_KEY',
    ],
  },
  firefox: { nome: 'Firefox (AMO)', env: ['FIREFOX_JWT_ISSUER', 'FIREFOX_JWT_SECRET'] },
  edge: { nome: 'Edge Add-ons', env: ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'] },
};
const FIREFOX_ID =
  process.env.FIREFOX_EXTENSION_ID ?? 'assistente-preenchimento@medeiroz.github.io';

/** 1 se a > b, -1 se a < b, 0 se iguais (só x.y.z numéricos). */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Decide, pelo estado da loja Chrome (fetchStatus v2), o que fazer com `versao`. */
export function decidirChrome(status, versao) {
  const versoes = (rev) =>
    (rev?.distributionChannels ?? []).map((c) => c.crxVersion).filter(Boolean);
  const enviadas = versoes(status.submittedItemRevisionStatus);
  const publicadas = versoes(status.publishedItemRevisionStatus);
  if ([...enviadas, ...publicadas].some((v) => compareVersions(v, versao) >= 0)) {
    return { acao: 'ja-publicada', motivo: `a loja já tem a ${versao} (ou mais nova)` };
  }
  if (status.submittedItemRevisionStatus) {
    return { acao: 'adiar', motivo: 'há outra versão em revisão; tenta de novo mais tarde' };
  }
  return { acao: 'enviar', motivo: `a loja tem ${publicadas.join(', ') || 'nenhuma versão'}` };
}

/** Decide, pela lista de versões do AMO, o que fazer com `versao`. */
export function decidirFirefox(lista, versao) {
  const existe = (lista?.results ?? []).some((v) => v.version === versao);
  return existe
    ? { acao: 'ja-publicada', motivo: `o AMO já tem a ${versao}` }
    : { acao: 'enviar', motivo: `o AMO não tem a ${versao}` };
}

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function statusChrome(env) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({
    iss: env.CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3000,
  });
  const sig = createSign('RSA-SHA256')
    .update(`${head}.${claim}`)
    .sign(env.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY, 'base64url');
  const tok = await (
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${head}.${claim}.${sig}`,
      }),
    })
  ).json();
  if (!tok.access_token) throw new Error('sem token da conta de serviço');
  const url = `https://chromewebstore.googleapis.com/v2/publishers/${env.CHROME_PUBLISHER_ID}/items/${env.CHROME_EXTENSION_ID}:fetchStatus`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${tok.access_token}` } });
  if (!r.ok) throw new Error(`fetchStatus ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function listaFirefox(env) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const claim = b64({ iss: env.FIREFOX_JWT_ISSUER, jti: randomUUID(), iat: now, exp: now + 60 });
  const sig = createHmac('sha256', env.FIREFOX_JWT_SECRET)
    .update(`${head}.${claim}`)
    .digest('base64url');
  const url = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(FIREFOX_ID)}/versions/?filter=all_with_unlisted&page_size=50`;
  const r = await fetch(url, { headers: { authorization: `JWT ${head}.${claim}.${sig}` } });
  if (!r.ok) throw new Error(`AMO versions ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

function argsDeEnvio(loja, versao) {
  const dir = '.output/release';
  const base = `${dir}/assistente-preenchimento-${versao}`;
  if (loja === 'chrome')
    return ['--chrome-zip', `${base}-chrome.zip`, '--chrome-api-version', 'v2'];
  if (loja === 'edge') return ['--edge-zip', `${base}-chrome.zip`];
  return [
    '--firefox-zip',
    `${base}-firefox.zip`,
    '--firefox-sources-zip',
    `${base}-sources.zip`,
    '--firefox-channel',
    'listed',
    '--firefox-compatibility',
    'firefox',
  ];
}

function marcar(loja, versao) {
  const arq = `publicado-${loja}.txt`;
  writeFileSync(arq, `${LOJAS[loja].nome} ${versao} ${new Date().toISOString()}\n`);
  const r = sh('gh', ['release', 'upload', `v${versao}`, arq, '--clobber'], { stdio: 'inherit' });
  if (r.status !== 0) console.log(`::warning::não consegui gravar o marcador ${arq} na Release.`);
}

function jaMarcada(loja, versao) {
  const r = sh('gh', ['release', 'view', `v${versao}`, '--json', 'assets', '-q', '.assets[].name']);
  return (r.stdout ?? '').split('\n').includes(`publicado-${loja}.txt`);
}

async function main() {
  const [loja, versao] = process.argv.slice(2);
  if (!LOJAS[loja] || !/^\d+\.\d+\.\d+$/.test(versao ?? '')) {
    console.error('uso: node scripts/publicar-loja.mjs <chrome|firefox|edge> <x.y.z>');
    process.exit(2);
  }
  const { nome, env: obrigatorias } = LOJAS[loja];
  if (obrigatorias.some((k) => !process.env[k])) {
    console.log(`::notice title=${nome}::secrets ausentes; loja não configurada, nada a publicar.`);
    return;
  }
  if (jaMarcada(loja, versao)) {
    console.log(
      `::notice title=${nome}::a ${versao} já foi enviada (marcador na Release); nada a fazer.`,
    );
    return;
  }
  if (loja === 'chrome' || loja === 'firefox') {
    const d =
      loja === 'chrome'
        ? decidirChrome(await statusChrome(process.env), versao)
        : decidirFirefox(await listaFirefox(process.env), versao);
    console.log(`${nome}: ${d.acao} (${d.motivo}).`);
    if (d.acao === 'ja-publicada') return marcar(loja, versao);
    if (d.acao === 'adiar') {
      console.log(`::warning title=${nome}::${d.motivo}.`);
      return;
    }
  }
  const r = sh('npx', ['wxt', 'submit', ...argsDeEnvio(loja, versao)], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === 0) return marcar(loja, versao);
  if (/InProgressSubmission|in review|in progress/i.test(saida)) {
    console.log(
      `::warning title=${nome}::há uma revisão em andamento; a ${versao} fica para a próxima tentativa.`,
    );
    return;
  }
  if (/already exists|already been submitted/i.test(saida)) {
    console.log(`::notice title=${nome}::a loja já tem a ${versao}.`);
    return marcar(loja, versao);
  }
  console.error(`::error title=${nome}::falha ao enviar a ${versao}.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
