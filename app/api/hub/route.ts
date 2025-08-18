import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/mfa-otp'
import { createVITTools } from '@/lib/tools/tools'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json().catch(() => ({}))
    const toolName = body?.toolName as string
    const args = (body?.args || {}) as Record<string, any>

    if (!toolName || typeof toolName !== 'string') {
      return new Response(JSON.stringify({ error: 'toolName is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tools = createVITTools(session.user.id)
    const tool = (tools as any)[toolName]

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
