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
