import * as z from 'zod/v3';

export const broadcastSlideSchema = z.object({
  title: z.string().min(1, 'Slide title is required'),
  text: z.string().min(1, 'Slide text is required'),
  image: z.string().min(1, 'Slide image is required'),
})

export type BroadcastSlide = z.infer<typeof broadcastSlideSchema>

export const broadcastSlidesSchema = z.array(broadcastSlideSchema)

export const broadcastPayloadSchema = z.object({
  slides: broadcastSlidesSchema.min(1, 'At least one slide is required'),
})

export type BroadcastPayload = z.infer<typeof broadcastPayloadSchema>

export const broadcastUpdateSchema = broadcastPayloadSchema.extend({
  id: z.string().min(1, 'Broadcast ID is required'),
})

export type BroadcastUpdatePayload = z.infer<typeof broadcastUpdateSchema>

export const broadcastDeleteSchema = z.object({
  id: z.string().min(1, 'Broadcast ID is required'),
})

export type BroadcastDeletePayload = z.infer<typeof broadcastDeleteSchema>

export const broadcastRecordSchema = broadcastPayloadSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  sentBy: z.string().optional(),
})

export type BroadcastRecord = z.infer<typeof broadcastRecordSchema>

export type LatestBroadcastResponse = BroadcastPayload & {
  id: string
  createdAt: string
}

export const pastBroadcastSchema = broadcastPayloadSchema.extend({
  id: z.string(),
  timestamp: z.string(),
  sentBy: z.string(),
})

export type PastBroadcast = z.infer<typeof pastBroadcastSchema>
