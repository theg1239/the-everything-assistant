import * as z from 'zod/v3';
import type { ApiKeyConfig } from '@/lib/api-key-manager'

const rateLimitWindowSchema = z.object({
  requestsPerMinute: z.number().int().nonnegative(),
  requestsPerHour: z.number().int().nonnegative(),
  requestsPerDay: z.number().int().nonnegative(),
})

const retryConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative(),
  backoffMultiplier: z.number().nonnegative(),
  maxBackoffMs: z.number().nonnegative(),
})

const apiKeyConfigBaseSchema = z.object({
  keys: z.array(z.string().min(1)),
  rateLimit: rateLimitWindowSchema,
  retryConfig: retryConfigSchema,
  enableRotation: z.boolean(),
  rotateOnRateLimit: z.boolean(),
  keyHealthCheckInterval: z.number().int().nonnegative(),
})

export const apiKeyConfigSchema = apiKeyConfigBaseSchema

export type ApiKeyConfigShape = z.infer<typeof apiKeyConfigSchema>

type _EnsureApiKeyConfigCompatibility = ApiKeyConfig extends ApiKeyConfigShape
  ? ApiKeyConfigShape extends ApiKeyConfig
    ? true
    : never
  : never

export const rateLimitActionRequestSchema = z.object({
  action: z.enum(['rotate', 'reset', 'update_config']),
  config: apiKeyConfigBaseSchema.partial().optional(),
})

export type RateLimitActionRequest = z.infer<typeof rateLimitActionRequestSchema>
