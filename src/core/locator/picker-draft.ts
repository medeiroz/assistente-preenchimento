import { z } from 'zod';
import { AdapterIdSchema, LocatorSchema } from '../model';
import type { Capture } from './capture';

/** Chave em `storage.local` onde o content script deixa a captura para a página de opções. */
export const PICKER_DRAFT_KEY = 'picker:draft';

/** Rascunho de consumo único: a página de opções lê e apaga a chave. */
export interface PickerDraft {
  capture: Capture;
  createdAt: number;
}

const CaptureSchema = z.object({
  locator: LocatorSchema,
  adapter: z.union([z.literal('auto'), AdapterIdSchema]),
  currentValue: z.string().nullable(),
  label: z.string().nullable(),
  container: z
    .object({ selector: z.string().min(1), textContains: z.string().optional() })
    .optional(),
  urlPattern: z.string(),
  frames: z.literal('all').optional(),
});

const PickerDraftSchema = z.object({ capture: CaptureSchema, createdAt: z.number() });

/** Valida o que veio do storage; devolve null para lixo ou formato antigo. */
export function parsePickerDraft(raw: unknown): PickerDraft | null {
  const r = PickerDraftSchema.safeParse(raw);
  if (!r.success) return null;
  const { capture, createdAt } = r.data;
  const out: Capture = {
    locator: capture.locator,
    adapter: capture.adapter,
    currentValue: capture.currentValue,
    label: capture.label,
    urlPattern: capture.urlPattern,
  };
  if (capture.frames) out.frames = capture.frames;
  if (capture.container) {
    out.container = { selector: capture.container.selector };
    if (capture.container.textContains) out.container.textContains = capture.container.textContains;
  }
  return { capture: out, createdAt };
}
