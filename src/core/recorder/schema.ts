import { z } from 'zod';
import { AdapterIdSchema, LocatorSchema } from '../model';

const ContainerSchema = z.object({ selector: z.string().min(1), textContains: z.string().optional() });

export const CaptureSchema = z.object({
  locator: LocatorSchema,
  adapter: z.union([z.literal('auto'), AdapterIdSchema]),
  currentValue: z.string().nullable(),
  label: z.string().nullable(),
  container: ContainerSchema.optional(),
  urlPattern: z.string(),
});

export const RecordedFieldSchema = z.object({
  capture: CaptureSchema,
  value: z.string(),
  url: z.string(),
  recordedAt: z.number(),
});

export const RecorderSessionSchema = z.object({
  tabId: z.number(),
  startedAt: z.number(),
  fields: z.array(RecordedFieldSchema),
});

export const RecordingGroupSchema = z.object({
  urlPattern: z.string(),
  container: ContainerSchema.optional(),
  fields: z.array(RecordedFieldSchema),
});

export const RecordingDraftSchema = z.object({
  createdAt: z.number(),
  groups: z.array(RecordingGroupSchema),
});
