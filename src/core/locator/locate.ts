import type { Locator } from '../model';
import { compareDeepOrder, composedParent, deepContains, deepQuery } from './deep-query';
import { normalizeLabel } from './normalize';
import type { LocateFn } from './types';

const CONTROL_SELECTOR = [
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="combobox"]',
  '[contenteditable="true"]',
].join(', ');

const CANDIDATE_SELECTOR = 'label, legend, [aria-label]';

function isElement(node: ParentNode): node is Element {
  return node.nodeType === 1;
}

function isControl(el: Element): boolean {
  return el.matches(CONTROL_SELECTOR);
}

/** Árvore (documento ou shadow root) onde os ids do elemento são resolvidos. */
function treeOf(el: Element): Document | ShadowRoot {
  return el.getRootNode() as Document | ShadowRoot;
}

/** Texto do candidato; ícones (svg e `<i>` sem texto) não contribuem. */
export function candidateText(el: Element): string {
  if (el.tagName !== 'LABEL' && el.tagName !== 'LEGEND' && el.hasAttribute('aria-label')) {
    return el.getAttribute('aria-label') ?? '';
  }
  // Caminho rápido: sem ícones dentro, não há o que remover (evita clonar o nó).
  if (!el.querySelector('svg, i')) return el.textContent ?? '';
  const clone = el.cloneNode(true) as Element;
  for (const icon of Array.from(clone.querySelectorAll('svg, i'))) {
    if ((icon.textContent ?? '').trim() === '') icon.remove();
  }
  return clone.textContent ?? '';
}

function inScope(el: Element, scope: ParentNode): boolean {
  return !isElement(scope) || scope === el || deepContains(scope, el);
}

/** Menor ancestral estrito de `from` que contém `target` (limitado ao escopo). */
function commonAncestor(from: Element, target: Element, scope: ParentNode): Element | null {
  let cur = composedParent(from);
  while (cur) {
    if (!inScope(cur, scope)) return null;
    if (deepContains(cur, target)) return cur;
    cur = composedParent(cur);
  }
  return null;
}

/** Menor ancestral estrito de `from` que contém algum controle. */
function ancestorWithControl(from: Element, scope: ParentNode): Element | null {
  let cur = composedParent(from);
  while (cur) {
    if (!inScope(cur, scope)) return null;
    if (deepQuery.querySelector(cur, CONTROL_SELECTOR)) return cur;
    cur = composedParent(cur);
  }
  return null;
}

/** Controles que referenciam `candidate` por aria-labelledby (ids valem dentro da mesma árvore). */
function controlsReferencing(candidate: Element, id: string, scope: ParentNode): Element[] {
  const tree = treeOf(candidate);
  return deepQuery
    .querySelectorAll(scope, '[aria-labelledby]')
    .filter(
      (c) =>
        treeOf(c) === tree && (c.getAttribute('aria-labelledby') ?? '').split(/\s+/).includes(id),
    );
}

/** Raízes de campo possíveis para um candidato (normalmente uma). */
function rootsFor(candidate: Element, scope: ParentNode): Element[] {
  // a. label[for]
  const forId = candidate.tagName === 'LABEL' ? candidate.getAttribute('for') : null;
  if (forId) {
    const control = treeOf(candidate).getElementById(forId);
    if (control) {
      const root = commonAncestor(candidate, control, scope);
      if (root) return [root];
    }
  }

  // b. controle descendente (ou o próprio elemento, p.ex. input[aria-label])
  if (isControl(candidate)) return [candidate];
  if (deepQuery.querySelector(candidate, CONTROL_SELECTOR)) {
    if (candidate.tagName === 'LABEL') {
      const parent = composedParent(candidate);
      return parent && inScope(parent, scope) ? [parent] : [candidate];
    }
    return [candidate];
  }

  // c. aria-labelledby
  if (candidate.id) {
    const roots: Element[] = [];
    for (const control of controlsReferencing(candidate, candidate.id, scope)) {
      const root = commonAncestor(candidate, control, scope);
      if (root) roots.push(root);
    }
    if (roots.length > 0) return roots;
  }

  // d. menor ancestral com um controle
  const root = ancestorWithControl(candidate, scope);
  return root ? [root] : [];
}

function collectCandidates(scope: ParentNode): Element[] {
  const found = deepQuery.querySelectorAll(scope, CANDIDATE_SELECTOR);
  const set = new Set<Element>(found);
  const sizeBefore = set.size;
  for (const control of deepQuery.querySelectorAll(scope, '[aria-labelledby]')) {
    const tree = treeOf(control);
    for (const id of (control.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (!id) continue;
      const el = tree.getElementById(id);
      if (el && inScope(el, scope)) set.add(el);
    }
  }
  const all = Array.from(set);
  // a consulta já devolve em ordem de documento; só reordena se entraram referências extras.
  if (set.size === sizeBefore) return all;
  return all.sort(compareDeepOrder);
}

/**
 * Raízes de todos os campos cujo rótulo casa com o localizador, em ordem de documento, numa
 * única passada (o texto de cada candidato é calculado uma vez). Para no `max`-ésimo resultado.
 */
function labelRoots(
  locator: Extract<Locator, { by: 'label' }>,
  scope: ParentNode,
  max: number,
): Element[] {
  const wanted = normalizeLabel(locator.text);
  const exact = locator.exact !== false;
  const roots: Element[] = [];
  for (const candidate of collectCandidates(scope)) {
    const text = normalizeLabel(candidateText(candidate));
    const matches = exact ? text === wanted : text.includes(wanted);
    if (!matches) continue;
    for (const root of rootsFor(candidate, scope)) {
      if (!roots.includes(root)) roots.push(root);
    }
    if (roots.length >= max) break;
  }
  return roots;
}

function locateByLabel(
  locator: Extract<Locator, { by: 'label' }>,
  scope: ParentNode,
): Element | null {
  const index = locator.index ?? 0;
  return labelRoots(locator, scope, index + 1)[index] ?? null;
}

/**
 * Todas as raízes que `locate` devolveria para o localizador, nos índices 0, 1, ... (até `max`),
 * sem reescanear a página a cada índice. Localizadores que não são de rótulo devolvem 0 ou 1.
 */
export function locateAll(locator: Locator, scope: ParentNode, max = 20): Element[] {
  if (locator.by === 'label') return labelRoots(locator, scope, max).slice(0, max);
  const one = locate(locator, scope);
  return one ? [one] : [];
}

function escapeAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function locateByName(name: string, scope: ParentNode): Element | null {
  let control: Element | null;
  try {
    control = deepQuery.querySelector(scope, `[name="${escapeAttr(name)}"]`);
  } catch {
    return null;
  }
  if (!control) return null;
  let cur = composedParent(control);
  while (cur && inScope(cur, scope)) {
    if (deepQuery.querySelector(cur, 'label, legend')) return cur;
    cur = composedParent(cur);
  }
  return control;
}

export const locate: LocateFn = (locator, scope) => {
  switch (locator.by) {
    case 'label':
      return locateByLabel(locator, scope);
    case 'selector':
      try {
        return deepQuery.querySelector(scope, locator.css);
      } catch {
        return null;
      }
    case 'name':
      return locateByName(locator.name, scope);
  }
};
