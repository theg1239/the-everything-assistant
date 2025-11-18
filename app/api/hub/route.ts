import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import { z } from 'zod'
import type { JsonValue } from '@/types/tools'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ])
)

const hubToolRequestSchema = z.object({
  toolName: z.string().min(1),
  args: z.record(jsonValueSchema).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
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

    const tools = createVITTools(session.user.id)
    const tool = (tools as Record<string, unknown>)[toolName] as
      | { execute: (toolArgs: Record<string, JsonValue>) => Promise<unknown> }
      | undefined

    if (!tool || typeof tool.execute !== 'function') {
      return new Response(
        JSON.stringify({ error: `Tool not found or not executable: ${toolName}` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result = await tool.execute(args)
    return new Response(JSON.stringify({ success: true, toolName, args, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[HUB] Tool execution failed:', error)
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Execution failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
