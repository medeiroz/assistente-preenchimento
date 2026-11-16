import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatMessage, setTranslator, type Catalog } from '../../src/core/i18n';
import { validateTemplate } from '../../src/core/expressions';
import { parseRule, type RunReport } from '../../src/core/model';
import { buildMenuItems } from '../../src/shared/context-menu';
import { createPageUi, TOAST_HOST_ATTR } from '../../src/entrypoints/content/page-ui';
import { createRecorderBar } from '../../src/entrypoints/content/recorder/bar';
import { createOverlay } from '../../src/entrypoints/content/picker/overlay';
import { TABS } from '../../src/entrypoints/options/composables/tabs';
import { sizeLabel } from '../../src/entrypoints/options/composables/sizeMeter';
import { summaryText, OUTCOME_LABELS } from '../../src/entrypoints/options/composables/format';
import { MODE_OPTIONS, adapterLabel } from '../../src/entrypoints/options/composables/draft';
import { formatSummary, modeLabel } from '../../src/entrypoints/popup/lib/outcome';

const en = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../public/_locales/en/messages.json'), 'utf8'),
) as Catalog;

/**
 * Cobre o catálogo `en` aplicado como tradutor, sem depender do Chromium: o E2E em inglês
 * (tests/e2e/i18n.spec.ts) só roda onde o `--lang` vale para o chrome.i18n (Linux/CI).
 */
beforeEach(() => {
  setTranslator((key, subs) => {
    const entry = en[key];
    return entry ? formatMessage(entry, subs ?? []) : '';
  }, 'en-US');
});
afterEach(() => setTranslator(null));

const report: RunReport = {
  ruleId: 'r',
  ruleName: 'Rule',
  startedAt: '2026-01-01T00:00:00.000Z',
  url: 'https://x/',
  origin: 'auto',
  fields: [
    { fieldId: 'a', description: 'a', outcome: 'filled', previousValue: null },
    { fieldId: 'b', description: 'b', outcome: 'error', previousValue: null },
  ],
};

describe('interface em inglês (catálogo en via setTranslator)', () => {
  it('rótulos e opções das Configurações são lidos no idioma atual', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Rules', 'Variables', 'History', 'Import/Export']);
    expect(MODE_OPTIONS.map((o) => o.label)).toEqual(['Automatic', 'One click', 'Off']);
    expect(adapterLabel('native-select')).toBe('Native select');
    expect(OUTCOME_LABELS.undone).toBe('Undone');
    expect(summaryText(report)).toBe('1 filled, 1 error');
  });

  it('medidor de tamanho usa o formato numérico do idioma da interface', () => {
    expect(sizeLabel(3174, 8192)).toBe('3.1 KB of 8 KB');
  });

  it('popup: resumo e modos', () => {
    expect(formatSummary(report)).toBe('1 filled · 0 skipped · 0 not found · 1 errors');
    expect(modeLabel('button')).toBe('One click');
  });

  it('mensagens de validação (Zod) saem em inglês na hora da validação', () => {
    const r = parseRule({
      id: 'x',
      name: '',
      trigger: { urlPatterns: ['nope'] },
      fields: [],
      updatedAt: 'x',
    });
    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors).toContain('name: the rule name cannot be empty');
    expect(errors.some((e) => e.includes('invalid URL pattern'))).toBe(true);
    expect(errors.some((e) => e.includes('invalid date'))).toBe(true);
  });

  it('erros de expressão: mensagem em inglês, nome do filtro intacto', () => {
    const r = validateTemplate('{{ var.x | nope }}');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).toBe('Unknown filter: "nope" (position 11)');
  });

  it('menu de contexto', () => {
    expect(buildMenuItems(null).map((i) => i.title)).toEqual([
      'Capture this field',
      'Fill with',
      'No rules on this page',
      'Pause on this site',
    ]);
  });

  it('toast, barra de gravação e overlay de captura da página', () => {
    document.body.innerHTML = '';
    createPageUi().showReport(report, { undo: () => undefined });
    const toast = document.querySelector(`[${TOAST_HOST_ATTR}]`)?.shadowRoot;
    expect(toast?.textContent).toContain('Assistant · Rule');
    expect(toast?.textContent).toContain('1 filled · 0 skipped · 0 not found · 1 errors');
    expect(toast?.textContent).toContain('Details');
    expect(toast?.querySelector('.close')?.getAttribute('aria-label')).toBe('Close');
    expect(toast?.querySelector('.undo')?.textContent).toBe('Undo');

    const bar = createRecorderBar(document, {
      onStop: () => undefined,
      onDiscard: () => undefined,
    });
    bar.setCount(2);
    const barText = [...document.querySelectorAll('div')]
      .map((d) => d.shadowRoot?.textContent ?? '')
      .join(' ');
    expect(barText).toContain('Recording fill · 2 fields');
    expect(barText).toContain('Stop and create rules');
    bar.destroy();

    const overlay = createOverlay(document, () => undefined);
    const overlayText = [...document.querySelectorAll('div')]
      .map((d) => d.shadowRoot?.textContent ?? '')
      .join(' ');
    expect(overlayText).toContain('Click the field you want to fill automatically');
    overlay.destroy();
    document.body.innerHTML = '';
  });
});
