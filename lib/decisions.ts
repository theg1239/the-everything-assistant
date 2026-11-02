import { experimental_decide as decide, type Experimental_DecisionModel } from 'ai'
import { decisionModel } from './ai'

/**
 * Confidence-gated option picking with the OpenAI Decisions API.
 *
 * Use it where code would otherwise need a full chat-model round trip just to pick one of N
 * structured options (a VTOP semester/course/faculty step, one of several catalog matches).
 * It returns `picked` only when the user's request clearly determines one option with
 * probability >= threshold; otherwise `undecided`, and the caller hands the options back to
 * the chat model (which may ask the user). It never guesses on the model's behalf.
 *
 * Question design follows OpenAI's Decisions guidance: shared evidence in `state`, one
 * `choice` whose option descriptions say when each applies, plus an explicit fallback.
 * The 0.8 default comes from a labeled VTOP selection set: every wrong answer scored <= 0.67,
 * correct picks scored higher, so 0.6-0.8 accepted zero wrong picks; 0.8 keeps a margin.
 */

export const DEFAULT_DECISION_THRESHOLD = 0.8

/** Choice key for "the request doesn't clearly identify exactly one listed option". */
const NO_CLEAR_MATCH = '__no_clear_match__'

/** OpenAI documents no hard cap on choices; stay well inside sane prompt sizes. */
const MAX_OPTIONS = 200

export interface DecisionOption {
  id: string
  label: string
  description?: string
}

export type PickOptionResult =
  | { status: 'picked'; id: string; probability: number }
  | {
      status: 'undecided'
      reason: 'no_clear_match' | 'low_confidence' | 'too_many_options' | 'error'
      probability?: number
    }

export interface PickOptionParams {
  /** The user's own words (latest request). Never paraphrased by code. */
  request: string
  /** What is being chosen, singular, e.g. "course", "faculty", "semester". */
  subject: string
  /** Short task context, e.g. "Downloading VIT VTOP course-page materials". */
  context?: string
  options: readonly DecisionOption[]
  threshold?: number
  model?: Experimental_DecisionModel
  abortSignal?: AbortSignal
}

export async function pickOption({
  request,
  subject,
  context,
  options,
  threshold = DEFAULT_DECISION_THRESHOLD,
  model = decisionModel(),
  abortSignal,
}: PickOptionParams): Promise<PickOptionResult> {
  if (options.length === 0 || !request.trim()) return { status: 'undecided', reason: 'no_clear_match' }
  if (options.length > MAX_OPTIONS) return { status: 'undecided', reason: 'too_many_options' }

  const criteria: Record<string, string> = {}
  for (const option of options) {
    const detail = option.description ? ` (${option.description})` : ''
    criteria[option.id] = `Choose when the student is asking for ${option.label}${detail}.`
  }
  criteria[NO_CLEAR_MATCH] =
    `Choose when the request does not clearly identify exactly one of the listed ${subject} options, ` +
    `fits several of them equally, or asks for a ${subject} that is not listed.`

  try {
    const result = await decide({
      model,
      state: context
        ? `${context}\nThe student's request: "${request}"`
        : `The student's request: "${request}"`,
      questions: {
        pick: {
          type: 'choice',
          instructions: `Which ${subject} is the student asking for? Students often use informal abbreviations and nicknames.`,
          criteria,
        },
      },
      abortSignal,
      maxRetries: 1,
    })
    const answer = result.answers.pick
    if (answer.type !== 'choice' || answer.choice === NO_CLEAR_MATCH) {
      return { status: 'undecided', reason: 'no_clear_match' }
    }
    const probability = answer.probabilities?.[answer.choice]
    if (probability === undefined || probability < threshold) {
      return { status: 'undecided', reason: 'low_confidence', probability }
    }
    return { status: 'picked', id: answer.choice, probability }
  } catch (error) {
    // Refusals, transient failures: never block the flow, just let the chat model choose.
    console.warn('[decisions] pickOption failed; deferring to the chat model', error)
    return { status: 'undecided', reason: 'error' }
  }
}
