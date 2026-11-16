import { splitDeepSelector } from './deep-selector';
import type { DeepQuery } from './types';

/** Quantos níveis de shadow root aninhados são percorridos (o resto é ignorado). */
export const MAX_SHADOW_DEPTH = 8;

const SHOW_ELEMENT = 1;

function isShadowRoot(node: Node | null): node is ShadowRoot {
  return node !== null && node.nodeType === 11 && 'host' in node;
}

/** Hosts da própria extensão (barra de gravação, captura, avisos): nunca fazem parte da página. */
const OWN_HOST_ATTR_PREFIX = 'data-assistente-';

function isOwnHost(el: Element): boolean {
  return el.getAttributeNames().some((n) => n.startsWith(OWN_HOST_ATTR_PREFIX));
}

/** Shadow root ABERTO do elemento (closed devolve null por design; hosts da extensão, também). */
export function openShadowOf(el: Element): ShadowRoot | null {
  const shadow = el.shadowRoot;
  return shadow && !isOwnHost(el) ? shadow : null;
}

/** Pai na árvore composta: atravessa a fronteira do shadow (raiz -> host). */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return isShadowRoot(root) ? root.host : null;
}

/** `ancestor` contém `node` considerando shadow roots (árvore composta). */
export function deepContains(ancestor: Node, node: Node): boolean {
  if (ancestor.contains(node)) return true;
  if (node.getRootNode() === ancestor.getRootNode()) return false;
  let cur: Node | null = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parentNode ?? (isShadowRoot(cur) ? cur.host : null);
  }
  return false;
}

// ------------------------------------------------------------------ detecção barata

/**
 * Cache de varreduras. Vale só até o fim da tarefa síncrona corrente (microtask): dentro de um
 * `locate`/`capture` o DOM não muda, e entre uma espera e outra tudo é recalculado.
 */
let hostCache = new Map<Node, boolean>();
let cacheArmed = false;

function armCache(): void {
  if (cacheArmed) return;
  cacheArmed = true;
  queueMicrotask(() => {
    hostCache = new Map();
    cacheArmed = false;
  });
}

function docOf(node: Node): Document | null {
  return node.nodeType === 9 ? (node as Document) : node.ownerDocument;
}

/** Existe algum elemento com shadow root aberto na árvore leve de `root`? (varredura O(n)) */
function scanHosts(root: Node): boolean {
  if (root.nodeType === 1 && openShadowOf(root as Element)) return true;
  const doc = docOf(root);
  if (!doc) return false;
  const walker = doc.createTreeWalker(root, SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (openShadowOf(n as Element)) return true;
  }
  return false;
}

/**
 * Caminho rápido: há shadow root aberto sob `scope`? Primeiro olha a árvore inteira que contém
 * o escopo (uma varredura, em cache); só se ela tiver hosts é que varre o próprio escopo.
 * Páginas sem shadow DOM pagam uma varredura por tarefa, não por consulta.
 */
export function hasOpenShadow(scope: ParentNode): boolean {
  armCache();
  const node = scope as Node;
  const cached = hostCache.get(node);
  if (cached !== undefined) return cached;
  const root = node.getRootNode();
  let rootHas = hostCache.get(root);
  if (rootHas === undefined) {
    rootHas = scanHosts(root);
    hostCache.set(root, rootHas);
  }
  const result = rootHas && (root === node ? true : scanHosts(node));
  hostCache.set(node, result);
  return result;
}

// ------------------------------------------------------------------ consulta profunda

function collect(
  tree: ParentNode,
  selector: string,
  depth: number,
  out: Element[],
  onlyFirst: boolean,
): void {
  const native = new Set<Element>(Array.from(tree.querySelectorAll(selector)));
  const node = tree as Node;
  const doc = docOf(node);
  if (!doc) return;
  // o próprio escopo pode ser um host: o shadow dele vem antes dos filhos leves
  const own =
    node.nodeType === 1 && depth < MAX_SHADOW_DEPTH ? openShadowOf(node as Element) : null;
  if (own) {
    collect(own, selector, depth + 1, out, onlyFirst);
    if (onlyFirst && out.length > 0) return;
  }
  const walker = doc.createTreeWalker(node, SHOW_ELEMENT);
  for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
    if (native.has(n)) {
      out.push(n);
      if (onlyFirst) return;
    }
    const shadow = depth < MAX_SHADOW_DEPTH ? openShadowOf(n) : null;
    if (shadow) {
      collect(shadow, selector, depth + 1, out, onlyFirst);
      if (onlyFirst && out.length > 0) return;
    }
  }
}

function deepAll(scope: ParentNode, selector: string, onlyFirst: boolean): Element[] {
  if (!hasOpenShadow(scope)) {
    if (onlyFirst) {
      const one = scope.querySelector(selector);
      return one ? [one] : [];
    }
    return Array.from(scope.querySelectorAll(selector));
  }
  const out: Element[] = [];
  collect(scope, selector, 0, out, onlyFirst);
  return out;
}

function chainAll(scope: ParentNode, selector: string, onlyFirst: boolean): Element[] {
  if (!selector.includes('>>>')) return deepAll(scope, selector, onlyFirst);
  const segments = splitDeepSelector(selector);
  if (segments.length === 0) return [];
  const [first = '', ...rest] = segments;
  let current = deepAll(scope, first, false);
  for (let i = 0; i < rest.length; i++) {
    const seg = rest[i] ?? '';
    const last = i === rest.length - 1;
    const next: Element[] = [];
    const seen = new Set<Element>();
    for (const host of current) {
      const shadow = openShadowOf(host);
      if (!shadow) continue;
      for (const el of deepAll(shadow, seg, last && onlyFirst)) {
        if (seen.has(el)) continue;
        seen.add(el);
        next.push(el);
      }
      if (last && onlyFirst && next.length > 0) return next;
    }
    current = next;
  }
  return current;
}

export const deepQuery: DeepQuery = {
  querySelectorAll: (scope, selector) => chainAll(scope, selector, false),
  querySelector: (scope, selector) => chainAll(scope, selector, true)[0] ?? null,
};

/** Todos os shadow roots abertos sob `scope` (aninhados inclusive), em ordem de documento. */
export function collectOpenShadowRoots(scope: ParentNode): ShadowRoot[] {
  const out: ShadowRoot[] = [];
  const visit = (tree: ParentNode, depth: number): void => {
    const node = tree as Node;
    const doc = docOf(node);
    if (!doc) return;
    const own =
      node.nodeType === 1 && depth < MAX_SHADOW_DEPTH ? openShadowOf(node as Element) : null;
    if (own) {
      out.push(own);
      visit(own, depth + 1);
    }
    const walker = doc.createTreeWalker(node, SHOW_ELEMENT);
    for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
      const shadow = depth < MAX_SHADOW_DEPTH ? openShadowOf(n) : null;
      if (!shadow) continue;
      out.push(shadow);
      visit(shadow, depth + 1);
    }
  };
  visit(scope, 0);
  return out;
}

// ------------------------------------------------------------------ ordem

function composedChain(node: Node): Node[] {
  const chain: Node[] = [];
  let cur: Node | null = node;
  while (cur) {
    chain.push(cur);
    cur = cur.parentNode ?? (isShadowRoot(cur) ? cur.host : null);
  }
  return chain.reverse();
}

/**
 * Ordem de documento na árvore composta: o conteúdo de um shadow root vem logo depois do seu
 * host e antes dos filhos "leves" do host. Negativo se `a` vem antes de `b`.
 */
export function compareDeepOrder(a: Node, b: Node): number {
  if (a === b) return 0;
  if (a.getRootNode() === b.getRootNode()) {
    return a.compareDocumentPosition(b) & 4 /* FOLLOWING */ ? -1 : 1;
  }
  const ca = composedChain(a);
  const cb = composedChain(b);
  let i = 0;
  while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
  const x = ca[i];
  const y = cb[i];
  if (!x) return -1; // a é ancestral de b
  if (!y) return 1;
  if (isShadowRoot(x)) return -1;
  if (isShadowRoot(y)) return 1;
  return x.compareDocumentPosition(y) & 4 ? -1 : 1;
}
