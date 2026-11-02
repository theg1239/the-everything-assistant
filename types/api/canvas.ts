import * as z from 'zod'

export const canvasCreateSchema = z.object({
  chatId: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  type: z.string().min(1).default('document'),
})

export type CanvasCreatePayload = z.infer<typeof canvasCreateSchema>

export const canvasUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
})

export type CanvasUpdatePayload = z.infer<typeof canvasUpdateSchema>
