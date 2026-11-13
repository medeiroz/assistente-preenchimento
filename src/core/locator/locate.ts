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
function candidateText(el: Element): string {
  if (el.tagName !== 'LABEL' && el.tagName !== 'LEGEND' && el.hasAttribute('aria-label')) {
    return el.getAttribute('aria-label') ?? '';
  }
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
  const set = new Set<Element>(scope.querySelectorAll(CANDIDATE_SELECTOR));
  const doc = ownerDoc(scope);
  for (const control of Array.from(scope.querySelectorAll('[aria-labelledby]'))) {
    for (const id of (control.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (!id) continue;
      const el = doc.getElementById(id);
      if (el && inScope(el, scope)) set.add(el);
    }
  }
  return Array.from(set).sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

function locateByLabel(
  locator: Extract<Locator, { by: 'label' }>,
  scope: ParentNode,
): Element | null {
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
  }
  return roots[locator.index ?? 0] ?? null;
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
