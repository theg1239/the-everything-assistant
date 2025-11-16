import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import { getFormattedVTOPCredentials as getServerFormatted } from '@/lib/server-vtop-credentials'
import { streamObject, type LanguageModelV1 } from 'ai'
import { vtopResultSchema } from './schema'
import { saveTokenUsage } from '@/lib/db'
import { rateLimitedAI } from '@/lib/rate-limited-ai'

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
    const tools = createVITTools(session.user.id)
    const vtop = (tools as any)['queryVTOP']
    if (!vtop || typeof vtop.execute !== 'function') {
      return new Response(JSON.stringify({ error: 'vtop tool not available' }), { status: 500 })
    }

    const serverCreds = await getServerFormatted()
    const args: any = {
      command,
      ...(serverCreds
        ? { username: serverCreds.username, password: serverCreds.encryptedPassword }
        : {}),
      ...extras,
    }

    const raw = await vtop.execute(args, { toolCallId: `vtop-${Date.now()}`, messages: [] })

    const modelName = 'gemini-flash-latest'
    const model = (await rateLimitedAI.google.model(modelName)) as LanguageModelV1
    const result = streamObject({
      model,
      schema: vtopResultSchema,
      prompt: [
        'You are a formatter for VTOP portal data (VIT University).',
        `Command: ${command}`,
        'Transform the following raw JSON into a structured result with:',
        '- a short lowercase title',
        '- a concise summary',
        '- formatted_content as valid HTML (semantic headings, lists, tables if appropriate)',
        '- structured_data as normalized JSON for downstream use',
        '- If there are links provided such as download links, include them in the formatted content, you can present the link directly in ( <link> )',
        '- Do not omit any data, like faculty names or courses as they are important',
        'Do not include any credentials or sensitive data.',
        'Here is the raw JSON to transform:',
        '```json',
        JSON.stringify(raw || {}, null, 2),
        '```',
      ].join('\n'),
      onFinish: async (final: any) => {
        try {
          const usage = (final && final.usage) || final?.response?.usage || null
          if (usage && typeof usage === 'object') {
            await saveTokenUsage({
              userId: session.user.id,
              chatId: null,
              model: modelName,
              stepIndex: null,
              promptTokens: usage.promptTokens || 0,
              completionTokens: usage.completionTokens || 0,
              totalTokens:
                usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
              meta: { type: 'hub-vtop', command },
            })
          }
        } catch (err) {
          console.warn('[hub/vtop] failed to save token usage:', err)
        }
      },
    })

    return result.toTextStreamResponse()
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'failed to stream vtop result' }), {
      status: 500,
    })
  }
}
