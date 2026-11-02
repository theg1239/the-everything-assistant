const { experimental_decide: decide, Experimental_DecisionRefusalError } = require('ai')
const logger = require('../utils/logger')

/**
 * Relevance judging for deep search.
 *
 * One OpenAI Decisions call per search iteration asks one boolean question per candidate:
 * "does this result help answer the student's question?". The relevance score of a candidate IS
 * the returned P(true). Nothing in this path counts or weighs query words: when the Decisions call
 * fails, callers fall back to retrieval order (pgvector / full-text RRF), not to keyword overlap.
 */

const DEFAULT_DECISION_MODEL_ID = 'gpt-6-luna'

/**
 * Chosen from the labeled fixture (test/fixtures/relevance-labeled.json, run with
 * scripts/benchmark-relevance.js). See AGENTIC_RAG.md "Relevance threshold" for the distributions.
 */
const DEFAULT_RELEVANCE_THRESHOLD = 0.5

/** Selection rule: keep p >= threshold, at most MAX_SELECTED, and if none pass keep the top MIN_SELECTED by p. */
const MAX_SELECTED_RESULTS = 12
const MIN_SELECTED_RESULTS = 3

/** The Decisions API accepts at most 400 questions per request. */
const MAX_QUESTIONS_PER_REQUEST = 400

const TITLE_MAX_CHARS = 160
const EXCERPT_MAX_CHARS = 600

function collapseWhitespace(value, maxChars) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

/**
 * The display title for a candidate. Comments and chunks have no title of their own (retrieval
 * fills `title` with the body), so they get a structural label instead of repeating the excerpt.
 */
function candidateTitle(candidate) {
  const subreddit = candidate?.subreddit ? `r/${candidate.subreddit}` : 'Reddit'
  if (candidate?.type === 'post') {
    return collapseWhitespace(candidate.title, TITLE_MAX_CHARS) || `Post in ${subreddit}`
  }
  if (candidate?.type === 'comment') return `Comment in ${subreddit}`
  return `Excerpt from a ${subreddit} discussion`
}

function candidateExcerpt(candidate) {
  return collapseWhitespace(candidate?.content, EXCERPT_MAX_CHARS) || '[no text content]'
}

/** Shared evidence for every question in the request. */
function buildRelevanceState(query) {
  return `A VIT Vellore student asked: ${JSON.stringify(String(query || '').trim())}`
}

/** The question id for the candidate at `index`; every question names its own result. */
function questionIdFor(index) {
  return `r${index}`
}

/** One boolean question per candidate, keyed r0..rN; each question carries its own result. */
function buildRelevanceQuestions(candidates) {
  const questions = {}
  candidates.forEach((candidate, index) => {
    const id = questionIdFor(index)
    questions[id] = {
      type: 'boolean',
      instructions:
        `Search result ${id} — title: ${JSON.stringify(candidateTitle(candidate))}; ` +
        `excerpt: ${JSON.stringify(candidateExcerpt(candidate))}. ` +
        "Does this result contain information, experiences or advice that directly helps answer the student's question? " +
        'Count partial answers and closely related rules or facts as helpful. ' +
        'Results about a different topic or place do not count.',
    }
  })
  return questions
}

function createAbortSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined
  return AbortSignal.timeout(timeoutMs)
}

function describeError(error) {
  if (!error) return 'unknown error'
  return error.message || String(error)
}

async function decideOnce({ model, state, questions, timeoutMs, maxRetries }) {
  const result = await decide({
    model,
    state,
    questions,
    maxRetries,
    abortSignal: createAbortSignal(timeoutMs),
  })
  return result.answers
}

/**
 * Judges every candidate against the student's question with one Decisions call.
 *
 * Resolves to `{ ok: true, probabilities, latencyMs, refusedIndexes }` where `probabilities[i]` is
 * P(candidate i helps answer the question) and refused candidates get `null`; or to
 * `{ ok: false, reason, latencyMs }` when the call failed (callers then fall back to retrieval order).
 * Never throws.
 */
async function judgeRelevance({ model, query, candidates, timeoutMs = 3000, maxRetries = 1 }) {
  const startedAt = Date.now()
  const list = Array.isArray(candidates) ? candidates.slice(0, MAX_QUESTIONS_PER_REQUEST) : []
  if (list.length === 0) return { ok: true, probabilities: [], refusedIndexes: [], latencyMs: 0 }

  const state = buildRelevanceState(query)
  const questions = buildRelevanceQuestions(list)
  const refused = new Set()

  try {
    let answers
    try {
      answers = await decideOnce({ model, state, questions, timeoutMs, maxRetries })
    } catch (error) {
      if (!Experimental_DecisionRefusalError.isInstance(error)) throw error

      // The SDK rejects the whole call when any question is refused. Treat refused results as not
      // relevant and ask again about the rest (once).
      const refusedIds = new Set(error.questionIds || [])
      logger.warn(
        `Decisions refused ${refusedIds.size}/${list.length} relevance questions (${[...refusedIds].join(', ')}); retrying without them`
      )
      const remaining = Object.fromEntries(
        Object.entries(questions).filter(([id]) => !refusedIds.has(id))
      )
      if (refusedIds.size === 0 || Object.keys(remaining).length === 0) throw error
      refusedIds.forEach(id => refused.add(id))
      answers = await decideOnce({ model, state, questions: remaining, timeoutMs, maxRetries: 0 })
    }

    const probabilities = list.map((_, index) => {
      const id = questionIdFor(index)
      if (refused.has(id)) return null
      const answer = answers[id]
      return answer?.type === 'boolean' && Number.isFinite(answer.probability)
        ? answer.probability
        : null
    })
    const refusedIndexes = list
      .map((_, index) => (refused.has(questionIdFor(index)) ? index : -1))
      .filter(index => index >= 0)

    return { ok: true, probabilities, refusedIndexes, latencyMs: Date.now() - startedAt }
  } catch (error) {
    const reason = Experimental_DecisionRefusalError.isInstance(error)
      ? `refused (${(error.questionIds || []).join(', ')})`
      : describeError(error)
    logger.error(
      `Decisions relevance call failed for ${list.length} candidates: ${reason}; falling back to retrieval order`
    )
    return { ok: false, reason, latencyMs: Date.now() - startedAt }
  }
}

/**
 * Selection rule over judged candidates (each with a numeric `relevanceScore` = P(relevant); null
 * scores are treated as 0): keep those with p >= threshold sorted by p, at most `maxResults`; when
 * none pass, keep the top `minResults` by p so the answer step still sees the best evidence.
 * Ties keep the incoming (retrieval) order.
 */
function selectRelevantResults(
  scoredResults,
  {
    threshold = DEFAULT_RELEVANCE_THRESHOLD,
    maxResults = MAX_SELECTED_RESULTS,
    minResults = MIN_SELECTED_RESULTS,
  } = {}
) {
  const ranked = (Array.isArray(scoredResults) ? scoredResults : [])
    .map((result, order) => ({ result, order, p: Number(result?.relevanceScore) || 0 }))
    .sort((a, b) => b.p - a.p || a.order - b.order)

  const passing = ranked.filter(item => item.p >= threshold).slice(0, maxResults)
  const chosen = passing.length > 0 ? passing : ranked.slice(0, minResults)
  return chosen.map(item => item.result)
}

/** Count of judged candidates at or above the threshold. */
function countAboveThreshold(scoredResults, threshold = DEFAULT_RELEVANCE_THRESHOLD) {
  return (Array.isArray(scoredResults) ? scoredResults : []).filter(
    result => (Number(result?.relevanceScore) || 0) >= threshold
  ).length
}

function meanRelevance(results) {
  const list = Array.isArray(results) ? results : []
  if (list.length === 0) return 0
  return list.reduce((sum, result) => sum + (Number(result?.relevanceScore) || 0), 0) / list.length
}

module.exports = {
  DEFAULT_DECISION_MODEL_ID,
  DEFAULT_RELEVANCE_THRESHOLD,
  MAX_SELECTED_RESULTS,
  MIN_SELECTED_RESULTS,
  MAX_QUESTIONS_PER_REQUEST,
  buildRelevanceState,
  buildRelevanceQuestions,
  judgeRelevance,
  selectRelevantResults,
  countAboveThreshold,
  meanRelevance,
}
