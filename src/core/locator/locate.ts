import type { Locator } from '../model';
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

function ownerDoc(scope: ParentNode): Document {
  if (isElement(scope)) return scope.ownerDocument;
  return scope as Document;
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
  return !isElement(scope) || scope === el || scope.contains(el);
}

/** Menor ancestral estrito de `from` que contém `target` (limitado ao escopo). */
function commonAncestor(from: Element, target: Element, scope: ParentNode): Element | null {
  let cur = from.parentElement;
  while (cur) {
    if (!inScope(cur, scope)) return null;
    if (cur.contains(target)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** Menor ancestral estrito de `from` que contém algum controle. */
function ancestorWithControl(from: Element, scope: ParentNode): Element | null {
  let cur = from.parentElement;
  while (cur) {
    if (!inScope(cur, scope)) return null;
    if (cur.querySelector(CONTROL_SELECTOR)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function controlsReferencing(id: string, scope: ParentNode): Element[] {
  return Array.from(scope.querySelectorAll('[aria-labelledby]')).filter((c) =>
    (c.getAttribute('aria-labelledby') ?? '').split(/\s+/).includes(id),
  );
}

/** Raízes de campo possíveis para um candidato (normalmente uma). */
function rootsFor(candidate: Element, scope: ParentNode): Element[] {
  const doc = ownerDoc(scope);

  // a. label[for]
  const forId = candidate.tagName === 'LABEL' ? candidate.getAttribute('for') : null;
  if (forId) {
    const control = doc.getElementById(forId);
    if (control) {
      const root = commonAncestor(candidate, control, scope);
      if (root) return [root];
    }
  }

  // b. controle descendente (ou o próprio elemento, p.ex. input[aria-label])
  if (isControl(candidate)) return [candidate];
  if (candidate.querySelector(CONTROL_SELECTOR)) {
    if (candidate.tagName === 'LABEL') {
      const parent = candidate.parentElement;
      return parent && inScope(parent, scope) ? [parent] : [candidate];
    }
    return [candidate];
  }

  // c. aria-labelledby
  if (candidate.id) {
    const roots: Element[] = [];
    for (const control of controlsReferencing(candidate.id, scope)) {
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
  const found = scope.querySelectorAll(CANDIDATE_SELECTOR);
  const set = new Set<Element>(found);
  const sizeBefore = set.size;
  const doc = ownerDoc(scope);
  for (const control of Array.from(scope.querySelectorAll('[aria-labelledby]'))) {
    for (const id of (control.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (!id) continue;
      const el = doc.getElementById(id);
      if (el && inScope(el, scope)) set.add(el);
    }
  }
  const all = Array.from(set);
  // querySelectorAll já devolve em ordem de documento; só reordena se entraram referências extras.
  if (set.size === sizeBefore) return all;
  return all.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
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
    control = scope.querySelector(`[name="${escapeAttr(name)}"]`);
  } catch {
    return null;
  }
  if (!control) return null;
  let cur = control.parentElement;
  while (cur && inScope(cur, scope)) {
    if (cur.querySelector('label, legend')) return cur;
    cur = cur.parentElement;
  }
  return control;
}

export const locate: LocateFn = (locator, scope) => {
  switch (locator.by) {
    case 'label':
      return locateByLabel(locator, scope);
    case 'selector':
      try {
        return scope.querySelector(locator.css);
      } catch {
        return null;
      }
    case 'name':
      return locateByName(locator.name, scope);
  }
};
