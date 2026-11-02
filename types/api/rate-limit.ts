import * as z from 'zod'

export const rateLimitActionRequestSchema = z.object({
  action: z.literal('reset_user_limits'),
  userId: z.string().min(1),
})

export type RateLimitActionRequest = z.infer<typeof rateLimitActionRequestSchema>

export interface RateLimitStatusResponse {
  status: 'ok'
  timestamp: string
  environment: {
    validation: { isValid: boolean; errors: string[] }
    summary: {
      hasRedis: boolean
      openaiApiKey: 'Set' | 'Not set'
      admin: { email: 'Configured' | 'Not configured' }
    }
  }
  userRateLimit: {
    enabled: boolean
    requestsPerMinute: number
    requestsPerHour: number
    requestsPerDay: number
  }
  healthCheck: {
    redis: 'Connected' | 'Not configured'
    openaiApiKey: 'Set' | 'Not set'
  }
}
