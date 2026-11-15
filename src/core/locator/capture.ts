import { createDefaultRegistry } from '../adapters';
import type { AdapterRegistry } from '../adapters';
import type { AdapterId, Locator } from '../model';
import { compareDeepOrder, composedParent, deepContains, deepQuery } from './deep-query';
import { candidateText, locate, locateAll } from './locate';

/** Contêiner sugerido (formato do `trigger.container` do modelo). */
export interface CaptureContainer {
  selector: string;
  textContains?: string;
}

/** O que o "Capturar campo" descobre sobre um campo da página. */
export interface Capture {
  /** Localizador com ida-e-volta garantida: `locate(locator, escopo) === raiz`. */
  locator: Locator;
  adapter: 'auto' | AdapterId;
  /** Valor atual segundo o adapter (null se ilegível); só serve de dica na edição. */
  currentValue: string | null;
  /** Rótulo detectado, sem `*` nem `:` no fim (null se o campo não tem rótulo). */
  label: string | null;
  container?: CaptureContainer;
  /** `protocolo//host/*` da página. */
  urlPattern: string;
}

/** Resultado da resolução da raiz sob um elemento qualquer (usado também no hover). */
export interface FieldHit {
  root: Element;
  label: string | null;
  adapter: 'auto' | AdapterId;
  /** Onde o localizador será resolvido: o contêiner sugerido ou o documento. */
  scope: ParentNode;
  container: { element: Element; selector: string } | null;
}

const CONTROL_SELECTOR = [
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="combobox"]',
  '[contenteditable="true"]',
].join(', ');

const CANDIDATE_SELECTOR = 'label, legend, [aria-label]';
/** Quantos níveis acima do elemento procurar um rótulo. */
const MAX_LEVELS = 12;
/** Um ancestral com mais rótulos que isto é uma seção, não um campo. */
const MAX_CANDIDATES = 16;
const MAX_SAME_LABEL = 20;
const TITLE_MAX = 80;

const DIALOG_SELECTORS = [
  '[role="dialog"]',
  'dialog[open]',
  '.eui-modal-wrapper.is-active',
  '.modal.is-active',
];
const TITLE_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"], .modal-card-title';

let registry: AdapterRegistry | null = null;
function adapters(): AdapterRegistry {
  registry ??= createDefaultRegistry();
  return registry;
}

function normalizeSpaces(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Rótulo sem espaços extras e sem `*`/`:` no fim. */
function cleanLabel(s: string): string {
  return normalizeSpaces(s).replace(/[\s*:]+$/, '');
}

// ------------------------------------------------------------------ contêiner

function isVisible(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  const style = view.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function isStableClass(c: string): boolean {
  return (
    /^[A-Za-z_][\w-]*$/.test(c) &&
    !/\d{3,}/.test(c) &&
    !STATE_CLASS.test(c) &&
    !/^(css|sc|jsx|svelte|ng|v)-/i.test(c)
  );
}

/** Classes que mudam com o estado do componente; nunca entram em seletores sugeridos. */
const STATE_CLASS =
  /^(is-(active|open|opened|focus|focused|hover|hovered|loading|invalid|valid|disabled|selected|visible|hidden|filled|empty|clearable)|has-(value|error|focus|content)|active|open|opened|focus|focused|selected|disabled|error|invalid|loading|show|shown|visible|hidden|hover|checked)$|--(active|highlight|selected|disabled|open)$/;

function findContainer(el: Element): { element: Element; selector: string } | null {
  const body = el.ownerDocument.body;
  // 1) padrões conhecidos, do ancestral mais próximo para o mais distante
  // (o seletor do contêiner é resolvido no documento: só vale para ancestrais da árvore leve)
  for (let a: Element | null = composedParent(el); a && a !== body; a = composedParent(a)) {
    if (a.getRootNode() !== el.ownerDocument) continue;
    for (const selector of DIALOG_SELECTORS) {
      if (a.matches(selector)) return { element: a, selector };
    }
  }
  // 2) genérico: classe contendo "modal" em um elemento visível
  for (let a: Element | null = composedParent(el); a && a !== body; a = composedParent(a)) {
    if (a.getRootNode() !== el.ownerDocument) continue;
    const cls = Array.from(a.classList).find((c) => /modal/i.test(c) && isStableClass(c));
    if (cls && isVisible(a)) return { element: a, selector: `.${cls}` };
  }
  return null;
}

function containerInfo(hit: { element: Element; selector: string }): CaptureContainer {
  const title = normalizeSpaces(deepQuery.querySelector(hit.element, TITLE_SELECTOR)?.textContent);
  const container: CaptureContainer = { selector: hit.selector };
  if (title) container.textContains = title.slice(0, TITLE_MAX).trim();
  return container;
}

// ------------------------------------------------------------------ raiz do campo

function labelTargetIsRadio(label: Element): boolean {
  if (label.tagName !== 'LABEL') return false;
  const forId = label.getAttribute('for');
  const control = forId
    ? (label.getRootNode() as Document | ShadowRoot).getElementById(forId)
    : deepQuery.querySelector(label, 'input');
  return control?.getAttribute('type')?.toLowerCase() === 'radio';
}

function candidatesIn(a: Element): Element[] {
  const set = new Set<Element>();
  if (a.matches(CANDIDATE_SELECTOR)) set.add(a);
  for (const c of deepQuery.querySelectorAll(a, CANDIDATE_SELECTOR)) set.add(c);
  for (const control of deepQuery.querySelectorAll(a, '[aria-labelledby]')) {
    const tree = control.getRootNode() as Document | ShadowRoot;
    for (const id of (control.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      const ref = id ? tree.getElementById(id) : null;
      if (ref) set.add(ref);
    }
  }
  return Array.from(set);
}

/** Todas as raízes que o locator devolveria para esse texto de rótulo (índices 0, 1, ...). */
function rootsForLabel(text: string, scope: ParentNode, memo?: Map<string, Element[]>): Element[] {
  const cached = memo?.get(text);
  if (cached) return cached;
  const roots = locateAll({ by: 'label', text }, scope, MAX_SAME_LABEL);
  memo?.set(text, roots);
  return roots;
}

function findByLabel(
  el: Element,
  scope: ParentNode,
  skipOptionLabels: boolean,
  memo: Map<string, Element[]>,
): { root: Element; label: string } | null {
  const doc = el.ownerDocument;
  let level = 0;
  for (let a: Element | null = el; a && level < MAX_LEVELS; a = composedParent(a), level++) {
    if (a === doc.body || a === doc.documentElement) break;
    const candidates = candidatesIn(a);
    if (candidates.length > MAX_CANDIDATES) break;
    candidates.sort(compareDeepOrder);
    for (const cand of candidates) {
      // botões/links com aria-label (ex.: "Fechar") não nomeiam campos
      if (cand.matches('button, a, [role="button"], [role="tab"]')) continue;
      if (skipOptionLabels && labelTargetIsRadio(cand)) continue;
      const label = cleanLabel(candidateText(cand));
      if (!label) continue;
      const hits = rootsForLabel(label, scope, memo).filter((r) => deepContains(r, el));
      // a menor raiz que contém o elemento
      const root = hits.sort((x, y) => (deepContains(x, y) ? 1 : -1))[0];
      if (root) return { root, label };
    }
  }
  return null;
}

/** `closest` que atravessa a fronteira de shadow roots. */
function closestDeep(el: Element, selector: string): Element | null {
  for (let a: Element | null = el; a; a = composedParent(a)) {
    if (a.matches(selector)) return a;
  }
  return null;
}

function findByControl(el: Element): { root: Element; label: string | null } | null {
  const control = closestDeep(el, '.multiselect') ?? closestDeep(el, CONTROL_SELECTOR);
  if (!control) return null;
  const aria = cleanLabel(control.getAttribute('aria-label') ?? '');
  return { root: control, label: aria || null };
}

/**
 * A partir de QUALQUER elemento sob o cursor, sobe até achar um rótulo/controle e resolve a
 * raiz do campo do mesmo jeito que o locator (`locate`). Null quando o elemento não está
 * dentro de um campo.
 */
export function resolveField(el: Element): FieldHit | null {
  const container = findContainer(el);
  const scope: ParentNode = container?.element ?? el.ownerDocument;
  // O DOM não muda durante a chamada: raízes por texto de rótulo são calculadas uma vez só.
  const memo = new Map<string, Element[]>();
  const found =
    findByLabel(el, scope, true, memo) ?? findByLabel(el, scope, false, memo) ?? findByControl(el);
  if (!found) return null;
  const adapter = adapters().resolve(found.root, 'auto');
  return {
    root: found.root,
    label: found.label,
    adapter: adapter?.id ?? 'auto',
    scope,
    container,
  };
}

// ------------------------------------------------------------------ seletor

const DATA_ATTRS = ['data-cy', 'data-testid', 'data-test', 'data-qa'];

function attrValue(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}

/** Segmento CSS curto e estável: id não numérico, data-cy/name/aria-label ou 1-2 classes. */
function segmentOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  for (const attr of DATA_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) return `${tag}[${attr}="${attrValue(v)}"]`;
  }
  const id = el.getAttribute('id');
  if (id && /^[A-Za-z][\w-]*$/.test(id) && !/\d{2,}/.test(id)) return `${tag}#${id}`;
  for (const attr of ['name', 'aria-label']) {
    const v = el.getAttribute(attr);
    if (v) return `${tag}[${attr}="${attrValue(v)}"]`;
  }
  const stable = Array.from(el.classList).filter(isStableClass);
  const primary = stable.filter((c) => !/^(is|has)-/.test(c));
  const picked = (primary.length > 0 ? primary : stable).slice(0, primary.length > 0 ? 2 : 1);
  return tag + picked.map((c) => `.${c}`).join('');
}

function nthOfType(el: Element): number {
  let n = 1;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
    if (s.tagName === el.tagName) n++;
  }
  return n;
}

function segmentWithPosition(el: Element): string {
  const seg = segmentOf(el);
  const parent = el.parentNode as ParentNode | null;
  if (!parent) return seg;
  const twins = Array.from(parent.children).filter((c) => c !== el && c.matches(seg));
  return twins.length > 0 ? `${seg}:nth-of-type(${nthOfType(el)})` : seg;
}

function resolvesTo(css: string, root: Element, scope: ParentNode): boolean {
  try {
    const all = deepQuery.querySelectorAll(scope, css);
    return all.length === 1 && all[0] === root;
  } catch {
    return false;
  }
}

interface Part {
  seg: string;
  /** Topo de um shadow root: o ancestral seguinte (mais externo) é o seu host. */
  topOfShadow: boolean;
}

/** Junta os trechos (do mais externo ao mais interno): `>` na mesma árvore, `>>>` ao descer. */
function joinParts(parts: Part[]): string {
  let css = '';
  parts.forEach((p, i) => {
    if (i === 0) css = p.seg;
    else css += `${p.topOfShadow ? ' >>> ' : ' > '}${p.seg}`;
  });
  return css;
}

/**
 * Seletor curto que, dentro de `scope`, devolve exatamente `root`. Para um campo dentro de
 * shadow root, a cadeia sempre inclui o host (`host >>> interno`).
 */
function buildSelector(root: Element, scope: ParentNode): string {
  const parts: Part[] = [];
  let css = '';
  let hostIncluded = root.getRootNode() === root.ownerDocument;
  for (let cur: Element | null = root; cur; cur = composedParent(cur)) {
    if (parts[0]?.topOfShadow) hostIncluded = true;
    const topOfShadow = cur.parentElement === null && cur.getRootNode() !== cur.ownerDocument;
    parts.unshift({ seg: segmentWithPosition(cur), topOfShadow });
    css = joinParts(parts);
    if (hostIncluded && resolvesTo(css, root, scope)) return css;
    if (cur.tagName === 'HTML') break;
  }
  return css;
}

// ------------------------------------------------------------------ locator

function uniqueName(root: Element, scope: ParentNode): string | null {
  const named = root.hasAttribute('name') ? root : deepQuery.querySelector(root, '[name]');
  const name = named?.getAttribute('name');
  if (!name) return null;
  const all = deepQuery.querySelectorAll(scope, `[name="${attrValue(name)}"]`);
  // vários inputs com o mesmo name (grupo de radios) só valem se todos estão dentro da raiz
  return all.length > 0 && all.every((n) => deepContains(root, n)) ? name : null;
}

function buildLocator(root: Element, label: string | null, scope: ParentNode): Locator {
  if (label) {
    // só vale se o rótulo é único: com repetidos o locator pegaria sempre o primeiro
    const only = rootsForLabel(label, scope);
    if (only.length === 1 && only[0] === root) return { by: 'label', text: label };
  }
  const name = uniqueName(root, scope);
  if (name) {
    const byName: Locator = { by: 'name', name };
    if (locate(byName, scope) === root) return byName;
  }
  return { by: 'selector', css: buildSelector(root, scope) };
}

function urlPatternOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return '';
  }
}

/**
 * Função pura: dado um elemento qualquer da página (o alvo do clique), descobre a raiz do
 * campo, o localizador, o adapter, o valor atual e o contêiner sugerido. Null se o elemento
 * não pertence a um campo.
 */
export function buildCapture(el: Element, doc: Document, url: string): Capture | null {
  if (el.ownerDocument !== doc) return null;
  const hit = resolveField(el);
  if (!hit) return null;
  const adapter = adapters().resolve(hit.root, 'auto');
  const capture: Capture = {
    locator: buildLocator(hit.root, hit.label, hit.scope),
    adapter: hit.adapter,
    currentValue: adapter ? adapter.read(hit.root) : null,
    label: hit.label,
    urlPattern: urlPatternOf(url),
  };
  if (hit.container) capture.container = containerInfo(hit.container);
  return capture;
}
