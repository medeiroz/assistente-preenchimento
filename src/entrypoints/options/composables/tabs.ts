// Para incluir uma aba nova (ex.: Variáveis), acrescente aqui e um painel no template.
export const TABS = [
  { id: 'rules', label: 'Regras' },
  { id: 'variables', label: 'Variáveis' },
  { id: 'history', label: 'Histórico' },
  { id: 'import-export', label: 'Importar/Exportar' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

export type TabChange = 'switch' | 'close-and-switch' | 'confirm';

/**
 * Decide o que fazer quando o usuário clica numa aba. O editor de regra só vive na aba
 * "Regras": sair dela (ou clicar nela de novo) fecha o editor, perguntando antes se houver
 * alterações não salvas.
 */
export function decideTabChange(state: { editorOpen: boolean; dirty: boolean }): TabChange {
  if (!state.editorOpen) return 'switch';
  return state.dirty ? 'confirm' : 'close-and-switch';
}

/**
 * Navegação por teclado do padrão WAI-ARIA para abas: setas (circular), Home e End.
 * Devolve a aba de destino, ou `null` para teclas que não navegam.
 */
export function tabForKey(current: TabId, key: string): TabId | null {
  const i = TABS.findIndex((t) => t.id === current);
  if (i < 0) return null;
  const n = TABS.length;
  if (key === 'ArrowRight') return TABS[(i + 1) % n]!.id;
  if (key === 'ArrowLeft') return TABS[(i - 1 + n) % n]!.id;
  if (key === 'Home') return TABS[0]!.id;
  if (key === 'End') return TABS[n - 1]!.id;
  return null;
}
