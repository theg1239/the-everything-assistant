import * as z from 'zod'

export const rateLimitActionRequestSchema = z.object({
  action: z.literal('reset_user_limits'),
  userId: z.string().min(1),
})

export type RateLimitActionRequest = z.infer<typeof rateLimitActionRequestSchema>

export const rateLimitStatusResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
  environment: z.object({
    validation: z.object({ isValid: z.boolean(), errors: z.array(z.string()) }),
    summary: z.object({
      hasRedis: z.boolean(),
      openaiApiKey: z.enum(['Set', 'Not set']),
      admin: z.object({ email: z.enum(['Configured', 'Not configured']) }),
    }),
  }),
  userRateLimit: z.object({
    enabled: z.boolean(),
    requestsPerMinute: z.number(),
    requestsPerHour: z.number(),
    requestsPerDay: z.number(),
  }),
  healthCheck: z.object({
    redis: z.enum(['Connected', 'Not configured']),
    openaiApiKey: z.enum(['Set', 'Not set']),
  }),
})

/** `GET /api/rate-limit-status` */
export type RateLimitStatusResponse = z.infer<typeof rateLimitStatusResponseSchema>
