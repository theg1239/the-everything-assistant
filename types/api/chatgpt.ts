import * as z from 'zod'

/**
 * ChatGPT (Codex app-server) connection status, shared by `lib/codex/app-server` (to read
 * proxy responses) and the clients of `app/api/auth/chatgpt/**`. Missing or mistyped fields
 * fall back to null instead of failing the whole status.
 */

const nullableOf = <T extends z.ZodType>(schema: T) => schema.nullable().catch(null)

export const chatgptRateLimitWindowSchema = z.object({
  usedPercent: nullableOf(z.number()),
  remainingPercent: nullableOf(z.number()),
  windowDurationMins: nullableOf(z.number()),
  resetsAt: nullableOf(z.number()),
})

export type ChatgptRateLimitWindow = z.infer<typeof chatgptRateLimitWindowSchema>

export const chatgptPlanUsageSchema = z.object({
  limitId: nullableOf(z.string()),
  limitName: nullableOf(z.string()),
  planType: nullableOf(z.string()),
  primary: nullableOf(chatgptRateLimitWindowSchema),
  secondary: nullableOf(chatgptRateLimitWindowSchema),
  hasCredits: nullableOf(z.boolean()),
  unlimitedCredits: nullableOf(z.boolean()),
  creditsBalance: nullableOf(z.string()),
})

export type ChatgptPlanUsage = z.infer<typeof chatgptPlanUsageSchema>

export const chatgptAuthModeSchema = z.enum(['apiKey', 'chatgpt', 'chatgptAuthTokens'])

/** `GET /api/auth/chatgpt/status`, `POST .../cancel`, `POST .../disconnect` */
export const chatgptStatusSchema = z.object({
  available: z.boolean().catch(false),
  connected: z.boolean().catch(false),
  authMode: nullableOf(chatgptAuthModeSchema),
  email: nullableOf(z.string()),
  planType: nullableOf(z.string()),
  planUsage: nullableOf(chatgptPlanUsageSchema),
  pendingLoginId: nullableOf(z.string()),
  lastLoginError: nullableOf(z.string()),
  requiresOpenaiAuth: nullableOf(z.boolean()),
})

export type ChatgptStatus = z.infer<typeof chatgptStatusSchema>

/** `POST /api/auth/chatgpt/start` */
export const chatgptLoginStartSchema = z.object({
  authUrl: nullableOf(z.string()),
  loginId: nullableOf(z.string()),
  status: chatgptStatusSchema.catch(() => chatgptStatusSchema.parse({})),
  loginMethod: z.enum(['browser', 'device']).optional().catch(undefined),
  deviceCode: z.string().nullish().catch(undefined),
  verificationUrl: z.string().nullish().catch(undefined),
})

export type ChatgptLoginStartResult = z.infer<typeof chatgptLoginStartSchema>
