import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import { getFormattedVTOPCredentials as getServerFormatted } from '@/lib/server-vtop-credentials'
import { google } from '@ai-sdk/google'
import { streamObject } from 'ai'
import { vtopResultSchema } from './schema'

export const maxDuration = 30

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const command = (body?.command as string) || 'attendance'
  const extras = (body?.extras || {}) as Record<string, any>

  try {
    // Execute VTOP tool first to fetch raw data quickly
    const tools = createVITTools(session.user.id)
    const vtop = (tools as any)['queryVTOP']
    if (!vtop || typeof vtop.execute !== 'function') {
      return new Response(JSON.stringify({ error: 'vtop tool not available' }), { status: 500 })
    }

    // Prefer server-linked credentials
    const serverCreds = await getServerFormatted()
    const args: any = { command, ...(serverCreds ? { username: serverCreds.username, password: serverCreds.encryptedPassword } : {}), ...extras }

    const raw = await vtop.execute(args, { toolCallId: `vtop-${Date.now()}`, messages: [] })

    // Stream parsed/pretty object via AI
    const result = streamObject({
      model: google('gemini-2.5-flash-lite'),
      schema: vtopResultSchema,
      prompt: [
        'You are a formatter for VTOP portal data (VIT University).',
        `Command: ${command}`,
        'Transform the following raw JSON into a structured result with:',
        '- a short lowercase title',
        '- a concise summary',
        '- formatted_content as valid HTML (semantic headings, lists, tables if appropriate)',
        '- structured_data as normalized JSON for downstream use',
        'Do not include any credentials or sensitive data.',
        'Here is the raw JSON to transform:',
        '```json',
        JSON.stringify(raw || {}, null, 2),
        '```',
      ].join('\n'),
    })

    console.log('VTOP result:', result)
    return result.toTextStreamResponse()
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'failed to stream vtop result' }), { status: 500 })
  }
}

