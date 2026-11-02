import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import * as z from 'zod'
import type { JsonValue } from '@/types/tools'
import {
  getToolExecutor,
  HUB_DIRECT_TOOLS,
  RATE_LIMITED_DIRECT_TOOLS,
  ToolInputError,
} from '@/app/api/chat/lib/tool-helpers'
import { enforceUserRateLimit, UserRateLimitError } from '@/lib/user-rate-limiter'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

const hubToolRequestSchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.string(), jsonValueSchema).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsedBody = hubToolRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { toolName, args = {} } = parsedBody.data

    if (!toolName) {
      return new Response(JSON.stringify({ error: 'toolName is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tools = createVITTools(session.user.id, {
      sessionUser: { name: session.user.name, email: session.user.email },
    })
    const execute = HUB_DIRECT_TOOLS.has(toolName) ? getToolExecutor(tools, toolName) : undefined

    if (!execute) {
      return new Response(
        JSON.stringify({ error: `Tool not found or not executable: ${toolName}` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (RATE_LIMITED_DIRECT_TOOLS.has(toolName)) {
      await enforceUserRateLimit(session.user.id)
    }
    const result = await execute(args)
    return new Response(JSON.stringify({ success: true, toolName, args, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof ToolInputError) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid tool arguments' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (error instanceof UserRateLimitError) {
      return new Response(JSON.stringify({ success: false, error: 'RATE_LIMIT_EXCEEDED' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error('[HUB] Tool execution failed:', error)
    return new Response(JSON.stringify({ success: false, error: 'Execution failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
