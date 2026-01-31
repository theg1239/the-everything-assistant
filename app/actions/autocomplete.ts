'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { getModelConfig } from '@/lib/model-registry'

const AUTOCOMPLETE_SYSTEM_PROMPT = [
  'You are an inline autocomplete engine in a college assistant chat box.',
  'Students type questions or messages for an AI assistant (courses, timetable, exams, campus life, policies).',
  'Use the recent conversation snippets as soft context; stay consistent with their tone and topic.',
  'Return only the missing tail that naturally continues the student\'s text. Never repeat or paraphrase the prefix.',
  'Match the student\'s tone, tense, and casing; stay concise (3-14 words).',
  'Start with a leading space when continuing a sentence; omit the space only if the next character should be punctuation.',
  'No newlines, bullet points, or meta commentary. Do not close quotes/brackets unless the prefix opened them and they remain unclosed.',
  'If the prefix seems finished (ends with . ? ! or is too short/ambiguous), return an empty string.',
].join(' ')

type RecentMessage = { role: 'user' | 'assistant'; content: string }

export async function getAutocompleteSuggestionAction(input: {
  partial: string
  recentMessages?: RecentMessage[]
}): Promise<string> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  if (!userId) {
    throw new Error('Unauthorized')
  }

  const trimmed = (input?.partial || '').trim()
  if (trimmed.length < 6) return ''

  if (/[.!?]\s*$/.test(trimmed)) return ''

  const clipped = trimmed.split(/\s+/).slice(-120).join(' ')

  const recentContext = (input.recentMessages || [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .slice(-6)
    .map(m => {
      const normalized = (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 240)
      const label = m.role === 'assistant' ? 'assistant' : 'student'
      return `${label}: ${normalized}`
    })
    .join('\n')

  try {
    const { provider, modelId } = getModelConfig('chatAutocomplete')
    const providerClient = rateLimitedAI[provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider: ${provider}`)
    }

    const prompt = [
      recentContext ? `Recent chat (for nuance only):\n${recentContext}\n` : '',
      'Prefix to complete (do not repeat):',
      clipped,
      'Completion:',
    ]
      .filter(Boolean)
      .join('\n')

    const result = await providerClient.generateText(
      {
        model: { modelId },
        system: AUTOCOMPLETE_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 20,
        temperature: 0.25,
        topP: 0.9,
        stopSequences: ['\n', '\n\n'],
      },
      userId
    )

    const suggestion = (result?.text ?? '').replace(/\s+/g, ' ').trim()
    return suggestion
  } catch (error) {
    console.error('[autocomplete] failed to generate suggestion', error)
    return ''
  }
}
