// Gera as capturas de tela da loja (store/screenshots/*.png, 1280x800) com dados FICTÍCIOS.
// Usa o build de testes (.output/chrome-mv3-e2e, gerado por `npm run build:e2e`) e o harness
// local em tests/harness. Rode com `npm run screenshots`.
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop } from '../tests/e2e/harness-server.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, '.output/chrome-mv3-e2e');
const outDir = path.join(root, 'store/screenshots');
const VIEWPORT = { width: 1280, height: 800 };
const NOW = '2026-01-15T12:00:00.000Z';

const field = (id, label, value, extra = {}) => ({
  id,
  enabled: true,
  locator: { by: 'label', text: label },
  adapter: 'auto',
  value,
  ...extra,
});

const rule = (id, name, urlPatterns, mode, fields, extra = {}) => ({
  id,
  name,
  enabled: true,
  trigger: { urlPatterns, settleMs: 300, ...extra.trigger },
  behavior: { mode, overwrite: 'onlyIfDefault', refill: 'oncePerAppearance' },
  fields,
  updatedAt: NOW,
  ...(extra.enabled === undefined ? {} : { enabled: extra.enabled }),
});

// Regra do harness (127.0.0.1 é coberto pelo build de testes): usada na captura do modal e do popup.
const HARNESS_RULES = [
  rule(
    'emissao-de-nota',
    'Emissão de nota fiscal',
    ['http://127.0.0.1/*'],
    'auto',
    [
      field('nbs', 'Código NBS', '126029000'),
      field('consumo', 'Operação de uso ou consumo pessoal', 'Não'),
      field(
        'interno',
        'Código interno do contribuinte',
        'NF-{{ now | date("YYYY") }}-{{ url.query.ref | default("0001") }}',
      ),
    ],
    {
      trigger: {
        container: {
          selector: '.eui-modal-wrapper.is-active',
          textContains: 'Emitir Nota Fiscal de Serviços Eletrônica',
        },
      },
    },
  ),
];

const VARIABLES = [
  { key: 'empresa', label: 'Nome da empresa', value: 'Exemplo Comércio Ltda' },
  { key: 'responsavel', label: 'Responsável', value: 'Maria Exemplo' },
  { key: 'cidade', label: 'Cidade', value: 'Campinas' },
  { key: 'email_contato', label: 'E-mail de contato', value: 'contato@exemplo.test' },
];

const DISPLAY_RULES = [
  rule('cadastro-de-cliente', 'Cadastro de cliente', ['https://app.exemplo.test/*'], 'auto', [
    field('nome', 'Nome', '{{ var.responsavel }}'),
    field('empresa', 'Empresa', '{{ var.empresa | upper }}'),
    field('cidade', 'Cidade', '{{ var.cidade }}'),
    field('email', 'E-mail', '{{ var.email_contato | lower }}'),
  ]),
  rule(
    'emissao-de-nota-exemplo',
    'Emissão de nota fiscal',
    ['https://app.exemplo.test/*'],
    'button',
    [
      field('competencia', 'Data de competência', '{{ now | startOfMonth | date("DD/MM/YYYY") }}'),
      field('vencimento', 'Vencimento', '{{ now | addDays(30) | date("DD/MM/YYYY") }}'),
      field(
        'observacao',
        'Observações',
        'Referente a {{ url.query.pedido | default("pedido avulso") }}',
      ),
    ],
  ),
  rule('pedido-de-compra', 'Pedido de compra', ['https://compras.exemplo.test/*'], 'auto', [
    field('solicitante', 'Solicitante', '{{ var.responsavel }}'),
    field('centro', 'Centro de custo', 'ADM-{{ now | date("MM") }}'),
  ]),
  rule(
    'inscricao-em-evento',
    'Inscrição em evento',
    ['https://eventos.exemplo.test/*'],
    'off',
    [field('participante', 'Participante', '{{ var.responsavel }}')],
    { enabled: false },
  ),
];

/** Grava a configuração direto no storage.sync, no formato interno (uma chave por regra). */
async function writeConfig(page, rules, variables) {
  await page.evaluate(
    async ({ rules, variables }) => {
      const sync = globalThis.chrome.storage.sync;
      await sync.clear();
      const items = {
        'cfg:meta': { schemaVersion: 1, ruleIds: rules.map((r) => r.id) },
        'cfg:settings': { pausedHosts: [] },
        'cfg:variables': variables,
      };
      for (const r of rules) items[`rule:${r.id}`] = r;
      await sync.set(items);
    },
    { rules, variables },
  );
}

const userDataDir = await mkdtemp(path.join(tmpdir(), 'pw-shots-'));
await mkdir(outDir, { recursive: true });
const baseURL = await start();
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  viewport: VIEWPORT,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extId = new URL(worker.url()).host;
  const extUrl = (file) => `chrome-extension://${extId}/${file}`;
  const shot = (page, name) => page.screenshot({ path: path.join(outDir, name) });

  // Em captura, as regras de exemplo não devem mostrar o selo "sem permissão".
  const grantAll = () => {
    globalThis.chrome.permissions.contains = () => Promise.resolve(true);
  };

  const admin = await context.newPage();
  await admin.addInitScript(grantAll);
  await admin.goto(extUrl('options.html'));
  await admin.waitForSelector('[data-testid="new-rule"]');

  // (a) harness com o modal preenchido e o toast
  await writeConfig(admin, HARNESS_RULES, VARIABLES);
  const page = await context.newPage();
  await page.goto(`${baseURL}/?ref=0042`);
  await page.click('#open-nfse');
  await page.waitForSelector('[data-assistente-preenchimento] .summary', { timeout: 10000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0;
  });
  await page.waitForTimeout(600);
  await shot(page, '01-preenchimento-automatico.png');

  // (d) popup sobre a mesma aba, em fundo neutro
  const tabId = await admin.evaluate(
    async (u) => (await globalThis.chrome.tabs.query({ url: u }))[0]?.id ?? -1,
    `${baseURL}/*`,
  );
  const popup = await context.newPage();
  await popup.goto(extUrl(`popup.html?tabId=${tabId}`));
  await popup.waitForSelector('[data-testid="host"]');
  await popup.addStyleTag({
    content: `
      html { background: #d9dee7; }
      body { display: flex; justify-content: center; align-items: flex-start; padding-top: 24px; background: transparent; }
      main { zoom: 1.3; background: #fff; border-radius: 10px; box-shadow: 0 8px 30px rgba(20,30,50,.25); }
    `,
  });
  await popup.waitForTimeout(300);
  await shot(popup, '04-popup.png');
  await popup.close();
  await page.close();

  // (b), (c), (e): páginas de configurações com regras e variáveis de exemplo
  await writeConfig(admin, DISPLAY_RULES, VARIABLES);
  await admin.reload();
  await admin.waitForSelector('[data-rule-id="cadastro-de-cliente"]');
  await admin.waitForTimeout(300);
  await shot(admin, '02-regras.png');

  await admin.locator('[data-rule-id="cadastro-de-cliente"] [data-action="edit"]').click();
  await admin.waitForSelector('[data-testid="save-rule"]');
  await admin.locator('[data-field-id="empresa"]').scrollIntoViewIfNeeded();
  await admin.evaluate(() => window.scrollBy(0, 120));
  await admin.waitForTimeout(400);
  await shot(admin, '03-editor-de-regra.png');
  await admin.locator('[data-testid="cancel-edit"]').click();

  await admin.getByRole('tab', { name: 'Variáveis' }).click();
  await admin.waitForSelector('.var-row');
  await admin.evaluate(() => window.scrollTo(0, 0));
  await admin.waitForTimeout(300);
  await shot(admin, '05-variaveis.png');
} finally {
  await context.close();
  await stop();
  await rm(userDataDir, { recursive: true, force: true });
}
console.log(`Capturas geradas em ${outDir}`);
