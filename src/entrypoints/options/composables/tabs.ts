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
