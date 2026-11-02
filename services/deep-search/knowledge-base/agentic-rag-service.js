const KnowledgeBase = require('./knowledge-base')
const { generateText, Output } = require('ai')
const { openai } = require('@ai-sdk/openai')
const { z } = require('zod')
const logger = require('../utils/logger')
const {
  DEFAULT_DECISION_MODEL_ID,
  DEFAULT_RELEVANCE_THRESHOLD,
  MAX_QUESTIONS_PER_REQUEST,
  judgeRelevance,
  selectRelevantResults,
  countAboveThreshold,
  meanRelevance,
} = require('./relevance-judge')

/** Query refinement and answer generation stay on the chat model. */
const CHAT_MODEL_ID = 'gpt-6.1-terra'

/** Results kept, in retrieval (RRF) order, when the relevance call fails before anything was judged. */
const RETRIEVAL_FALLBACK_RESULTS = 8

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function parseFraction(value, fallback) {
  const parsed = Number.parseFloat(value || '')
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(1, parsed))
}

function createAbortSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined
  }
  return AbortSignal.timeout(timeoutMs)
}

function resultKey(result) {
  return `${result?.type}:${result?.reddit_id}`
}

/**
 * Agentic retrieval over the Reddit knowledge base.
 *
 * Each iteration: hybrid retrieval (pgvector + Postgres full-text, RRF) -> one OpenAI Decisions
 * call that returns P(relevant) for every new candidate -> stop once enough candidates clear the
 * threshold, otherwise ask the chat model for a refined query and repeat. Selection runs over every
 * candidate judged in any iteration (probabilities are all against the original question, so they
 * are comparable). Answer generation stays on the chat model.
 */
class AgenticRAGService {
  constructor(options = {}) {
    this.knowledgeBase = options.knowledgeBase || new KnowledgeBase()
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH || '3200', 10)
    this.searchLimit = parsePositiveInt(process.env.AGENTIC_SEARCH_LIMIT, 20)
    this.relevanceCandidateLimit = Math.min(
      MAX_QUESTIONS_PER_REQUEST,
      parsePositiveInt(process.env.AGENTIC_RELEVANCE_CANDIDATES, 15)
    )
    this.relevanceTimeoutMs = parsePositiveInt(process.env.AGENTIC_RELEVANCE_TIMEOUT_MS, 3000)
    this.refinementTimeoutMs = parsePositiveInt(process.env.AGENTIC_REFINEMENT_TIMEOUT_MS, 3000)
    this.responseTimeoutMs = parsePositiveInt(process.env.AGENTIC_RESPONSE_TIMEOUT_MS, 12000)
    this.responseMaxOutputTokens = parsePositiveInt(
      process.env.AGENTIC_RESPONSE_MAX_OUTPUT_TOKENS,
      1200
    )
    this.responseRetryTimeoutMs = parsePositiveInt(
      process.env.AGENTIC_RESPONSE_RETRY_TIMEOUT_MS,
      5000
    )
    this.responseRetryMaxOutputTokens = parsePositiveInt(
      process.env.AGENTIC_RESPONSE_RETRY_MAX_OUTPUT_TOKENS,
      550
    )
    // Stop searching once this many judged candidates have P(relevant) >= threshold.
    this.minConfidentResults = parsePositiveInt(process.env.AGENTIC_FIRST_PASS_MIN_RESULTS, 4)
    this.relevanceThreshold = parseFraction(
      process.env.DEEP_SEARCH_RELEVANCE_THRESHOLD,
      DEFAULT_RELEVANCE_THRESHOLD
    )

    this.chatModel = options.chatModel || openai(CHAT_MODEL_ID)
    this.decisionModelId = process.env.DEEP_SEARCH_DECISION_MODEL || DEFAULT_DECISION_MODEL_ID
    this.decisionModel = options.decisionModel || openai.decisionModel(this.decisionModelId)
    this.refinementAgent =
      options.refinementAgent ||
      new QueryRefinementAgent(this.chatModel, { timeoutMs: this.refinementTimeoutMs })

    this.maxIterations = 2
  }

  async generateResponse(query, conversationHistory = []) {
    try {
      logger.info(`Starting agentic RAG response for query: "${query}"`)

      const agenticResult = await this.agenticSearch(query)

      if (!agenticResult.success || agenticResult.relevantResults.length === 0) {
        return {
          response:
            "I couldn't find any relevant information in the Reddit knowledge base for your query. The search agents tried multiple approaches but couldn't locate matching discussions. Try rephrasing your question or asking about more general topics.",
          sources: [],
          confidence: 0,
          searchResults: 0,
          searchAttempts: agenticResult.attempts || 1,
        }
      }

      const context = this.buildContext(agenticResult.relevantResults)
      const response = await this.generateAIResponse(
        query,
        context,
        conversationHistory,
        agenticResult
      )

      return {
        response: response,
        sources: this.formatSources(
          this.prioritizeResponseResults(agenticResult.relevantResults, 8).slice(0, 8)
        ),
        confidence: this.calculateConfidence(agenticResult.relevantResults),
        searchResults: agenticResult.relevantResults.length,
        searchAttempts: agenticResult.attempts,
        refinedQueries: agenticResult.queriesUsed,
      }
    } catch (error) {
      logger.error('Error in agentic RAG response:', error)
      return {
        response:
          'I encountered an error while analyzing your query. Please try again with a different search approach.',
        sources: [],
        confidence: 0,
        error: error.message,
      }
    }
  }

  async agenticSearch(originalQuery) {
    logger.info(`Starting agentic search for: "${originalQuery}"`)

    const threshold = this.relevanceThreshold
    const judged = new Map() // resultKey -> candidate with relevanceScore = P(relevant)
    const seen = new Set() // every candidate sent to the judge (incl. refused ones)
    const attempts = []
    const queriesUsed = []
    let fallbackResults = null

    for (let i = 0; i < this.maxIterations; i++) {
      let currentQuery = originalQuery

      if (i > 0) {
        const confident = [...judged.values()].filter(r => r.relevanceScore >= threshold)
        const refinedQuery = await this.refinementAgent.refineQuery(originalQuery, confident, i)
        if (!refinedQuery || queriesUsed.includes(refinedQuery)) {
          logger.info('Query refinement produced no new query; using results so far')
          break
        }
        logger.info(`Generated refined query: "${refinedQuery}"`)
        currentQuery = refinedQuery
      }

      queriesUsed.push(currentQuery)
      attempts.push({ iteration: i, query: currentQuery })
      logger.info(`Iteration ${i + 1}: Searching with query: "${currentQuery}"`)

      const searchResults = await this.knowledgeBase.search(currentQuery, this.searchLimit)
      const candidates = searchResults
        .filter(result => !seen.has(resultKey(result)))
        .slice(0, this.relevanceCandidateLimit)

      if (candidates.length === 0) {
        logger.info(`No new candidates for query: "${currentQuery}"`)
        continue
      }

      // The question is always the student's original one, so probabilities from every iteration
      // are on the same scale.
      const verdict = await judgeRelevance({
        model: this.decisionModel,
        query: originalQuery,
        candidates,
        timeoutMs: this.relevanceTimeoutMs,
      })

      if (!verdict.ok) {
        logger.warn(
          `Relevance judging unavailable (${verdict.reason}); ${
            judged.size > 0
              ? 'keeping candidates judged in earlier iterations'
              : `falling back to the top ${RETRIEVAL_FALLBACK_RESULTS} candidates in retrieval order`
          }`
        )
        if (judged.size === 0) {
          fallbackResults = candidates
            .slice(0, RETRIEVAL_FALLBACK_RESULTS)
            .map(result => ({ ...result, relevanceScore: null }))
        }
        break
      }

      candidates.forEach((candidate, index) => {
        seen.add(resultKey(candidate))
        const probability = verdict.probabilities[index]
        if (probability == null) return // refused: never selected
        judged.set(resultKey(candidate), {
          ...candidate,
          relevanceScore: probability,
          matchedQuery: currentQuery,
        })
      })

      const confidentCount = countAboveThreshold([...judged.values()], threshold)
      logger.info(
        `Decisions judged ${candidates.length} candidates in ${verdict.latencyMs}ms; ${confidentCount} total at P>=${threshold}`
      )

      if (confidentCount >= this.minConfidentResults) {
        logger.info('Enough relevant results, stopping search early')
        break
      }
    }

    const relevantResults =
      fallbackResults || selectRelevantResults([...judged.values()], { threshold })
    const confidentResults = fallbackResults ? 0 : countAboveThreshold(relevantResults, threshold)

    return {
      success: relevantResults.length > 0,
      relevantResults,
      maxRelevanceScore: meanRelevance(relevantResults),
      confidentResults,
      relevanceMode: fallbackResults ? 'retrieval-order' : 'decisions',
      attempts,
      queriesUsed,
    }
  }

  buildContext(searchResults) {
    let context = ''
    let currentLength = 0

    const sortedResults = this.prioritizeResponseResults(searchResults, 6)

    for (const result of sortedResults) {
      const snippet = this.formatResultForContext(result)

      if (currentLength + snippet.length > this.maxContextLength) {
        break
      }

      context += snippet + '\n\n'
      currentLength += snippet.length
    }

    return context.trim()
  }

  /** Posts, then comments, then chunks; within a type by P(relevant); otherwise incoming order. */
  prioritizeResponseResults(searchResults = [], minCount = 5) {
    const ranked = [...(Array.isArray(searchResults) ? searchResults : [])].sort((a, b) => {
      const typeScore = value => (value?.type === 'post' ? 2 : value?.type === 'comment' ? 1 : 0)
      const typeDelta = typeScore(b) - typeScore(a)
      if (typeDelta !== 0) return typeDelta
      return (Number(b?.relevanceScore) || 0) - (Number(a?.relevanceScore) || 0)
    })

    const nonChunk = ranked.filter(item => item.type !== 'chunk')
    if (nonChunk.length === 0) return ranked

    const chunks = ranked.filter(item => item.type === 'chunk')
    const target = Math.min(ranked.length, Math.max(minCount, nonChunk.length))
    return [...nonChunk, ...chunks].slice(0, target)
  }

  formatResultForContext(result) {
    const sourceType = result.type.toUpperCase()
    const subreddit = `r/${result.subreddit}`
    const author = result.author ? `u/${result.author}` : 'Unknown'
    const upvotes = result.upvotes || 0
    const score = result.score || 0
    const relevanceScore = result.relevanceScore
      ? ` (${(result.relevanceScore * 100).toFixed(0)}% relevant)`
      : ''

    const engagement = upvotes > 0 ? `↑${upvotes} upvotes` : `${score} points`

    let content = ''
    if (result.type === 'post') {
      content = `POST TITLE: ${result.title}\nPOST CONTENT: ${result.content || '[No text content - possibly image/link post]'}`
    } else if (result.type === 'comment') {
      content = `COMMENT: ${result.content}`
    } else {
      content = `CONTENT: ${result.content}`
    }

    return `[${sourceType}] ${subreddit} | ${author} | ${engagement}${relevanceScore}
${content}
---`
  }

  extractGeneratedText(result) {
    if (!result) return ''

    if (typeof result.text === 'string' && result.text.trim()) {
      return result.text
    }

    try {
      if (typeof result.output === 'string' && result.output.trim()) {
        return result.output
      }
    } catch {
      return ''
    }

    return ''
  }

  sanitizeHtmlResponse(text) {
    const clean = String(text || '')
      .replace(/```html\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/`/g, '')
      .trim()

    if (!clean) return ''
    if (clean.includes('reddit-response')) return clean
    return `<div class="reddit-response">${clean}</div>`
  }

  buildCompactContext(searchResults, maxItems = 4) {
    const shortlist = this.prioritizeResponseResults(searchResults)
      .slice(0, maxItems)
      .map(result => {
        const title = String(result.title || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120)
        const content = String(result.content || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220)
        const author = result.author ? `u/${result.author}` : 'unknown'
        const upvotes = Number(result.upvotes || result.score || 0)
        return `- ${title}\n  ${content}\n  source: ${author}, upvotes=${upvotes}, subreddit=r/${result.subreddit || 'unknown'}`
      })
      .join('\n')

    return shortlist || 'No context available.'
  }

  buildDeterministicFallbackHtml(query, searchResults = []) {
    const top = this.prioritizeResponseResults(searchResults).slice(0, 5)
    const items = top
      .map(result => {
        const title = String(result.title || 'Untitled').replace(/[<>]/g, '')
        const author = result.author ? `u/${result.author}` : 'unknown'
        const upvotes = Number(result.upvotes || result.score || 0)
        const subreddit = result.subreddit ? `r/${result.subreddit}` : 'r/unknown'
        const excerpt = String(result.content || '')
          .replace(/[<>]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220)
        return `<li><strong>${title}</strong> <span style="color:#0066cc;">${author}</span> <span style="color:#ff4500;">↑${upvotes}</span> (${subreddit})<br/>${excerpt}</li>`
      })
      .join('')

    return `<div class="reddit-response"><h3>Overview</h3><p>Here are the most relevant Reddit discussions found for: <strong>${String(
      query || ''
    ).replace(
      /[<>]/g,
      ''
    )}</strong>.</p><h3>Student Experiences</h3><ul>${items || '<li>No reliable sources found.</li>'}</ul><h3>Bottom Line & Recommendations</h3><p>Use the highest-upvoted and most recent threads first, then cross-check with official campus resources before acting.</p></div>`
  }

  async generateAIResponse(query, context, conversationHistory, agenticResult) {
    const searchInfo =
      agenticResult.attempts.length > 1
        ? `Search refined ${agenticResult.attempts.length} times to find the most relevant results.`
        : 'Direct search results found.'
    const evidenceNote =
      agenticResult.relevanceMode === 'decisions' && agenticResult.confidentResults === 0
        ? '\n- None of the retrieved discussions was judged directly relevant to the question: say the evidence is weak.'
        : ''
    const systemPrompt = `You are a student assistant summarizing Reddit evidence for college queries.

Return ONLY HTML with this structure:
<div class="reddit-response">
<h3>Overview</h3><p>2-3 sentence answer.</p>
<h3>Student Experiences</h3><ul><li>3-6 concrete points with evidence.</li></ul>
<h3>Important Details</h3><ul><li>Practical details, caveats, and timing/cost/location if available.</li></ul>
<h3>Bottom Line & Recommendations</h3><p>Actionable recommendation.</p>
</div>

Rules:
- Keep total length concise (about 180-280 words).
- Cite source handles and upvotes when present (e.g., u/name, ↑32).
- Do not invent users, votes, or facts.
- If evidence is weak, say so clearly.
- ${searchInfo}${evidenceNote}`

    // AI SDK v7 rejects `role: 'system'` entries in `messages`; the system prompt goes in
    // `instructions`, and client-supplied history is limited to user/assistant turns.
    const messages = []

    conversationHistory.forEach(msg => {
      if (msg && (msg.role === 'user' || msg.role === 'assistant')) {
        messages.push(msg)
      }
    })

    messages.push({
      role: 'user',
      content: `User query: ${query}\n\nUse only this retrieved context:\n${context}`,
    })

    const compactSystemPrompt = `You are a student assistant. Return ONLY HTML in this structure:
<div class="reddit-response">
<h3>Overview</h3><p>2-3 sentence answer</p>
<h3>Student Experiences</h3><ul><li>3-5 concrete points with source attribution (username and upvotes when available)</li></ul>
<h3>Bottom Line & Recommendations</h3><p>Actionable recommendation</p>
</div>
Do not use markdown.`

    try {
      const primaryResult = await generateText({
        model: this.chatModel,
        instructions: systemPrompt,
        messages: messages,
        maxOutputTokens: this.responseMaxOutputTokens,
        maxRetries: 0,
        abortSignal: createAbortSignal(this.responseTimeoutMs),
        output: Output.text(),
        providerOptions: {
          openai: {
            reasoningEffort: 'none',
          },
        },
      })

      const primaryText = this.extractGeneratedText(primaryResult)
      const primaryClean = this.sanitizeHtmlResponse(primaryText)
      if (primaryClean) return primaryClean

      logger.warn('Primary response generation returned empty output')
    } catch (error) {
      logger.warn(`Primary response generation failed: ${error?.message || String(error)}`)
    }

    try {
      const compactContext = this.buildCompactContext(agenticResult.relevantResults, 4)
      const retryResult = await generateText({
        model: this.chatModel,
        instructions: `${compactSystemPrompt}\n\nContext:\n${compactContext}`,
        messages: [{ role: 'user', content: query }],
        maxOutputTokens: this.responseRetryMaxOutputTokens,
        maxRetries: 0,
        abortSignal: createAbortSignal(this.responseRetryTimeoutMs),
        output: Output.text(),
        providerOptions: {
          openai: {
            reasoningEffort: 'none',
          },
        },
      })

      const retryText = this.extractGeneratedText(retryResult)
      const retryClean = this.sanitizeHtmlResponse(retryText)
      if (retryClean) return retryClean

      logger.warn('Compact retry returned empty output')
    } catch (error) {
      logger.warn(`Compact retry failed: ${error?.message || String(error)}`)
    }

    return this.buildDeterministicFallbackHtml(query, agenticResult.relevantResults)
  }

  formatSources(searchResults) {
    return searchResults.map(result => ({
      type: result.type,
      subreddit: result.subreddit,
      title: result.title,
      author: result.author,
      score: result.score,
      upvotes: result.upvotes,
      url: result.url,
      similarity: result.similarity,
      relevanceScore: result.relevanceScore,
      created: result.created_utc,
    }))
  }

  calculateConfidence(searchResults) {
    if (searchResults.length === 0) return 0

    const relevanceScores = searchResults.map(r => r.relevanceScore || 0)
    const avgRelevance = relevanceScores.reduce((sum, s) => sum + s, 0) / relevanceScores.length

    const scores = searchResults.map(r => parseInt(r.score) || 0)
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length

    const resultsCount = Math.min(searchResults.length, 10) / 10
    const diversity = this.calculateDiversity(searchResults)

    const confidence =
      avgRelevance * 0.4 + Math.min(avgScore / 20, 1) * 0.3 + resultsCount * 0.2 + diversity * 0.1

    return Math.round(Math.max(20, Math.min(100, confidence * 100)))
  }

  calculateDiversity(results) {
    const uniqueSubreddits = new Set(results.map(r => r.subreddit)).size
    const uniqueAuthors = new Set(results.map(r => r.author)).size
    const postTypes = new Set(results.map(r => r.type)).size

    return Math.min(1, (uniqueSubreddits + uniqueAuthors + postTypes) / (results.length + 2))
  }
}

/** Generates the next search query with the chat model. Returns null when it has nothing new. */
class QueryRefinementAgent {
  static QUERY_REFINEMENT_OUTPUT_SCHEMA = z.object({
    refinedQuery: z.string().min(5),
    preservesIntent: z.boolean(),
    confidence: z.number().min(0).max(1),
  })

  constructor(model, options = {}) {
    this.model = model
    this.timeoutMs = parsePositiveInt(options.timeoutMs, 3500)
    this.maxOutputTokens = parsePositiveInt(options.maxOutputTokens, 96)
  }

  async refineQuery(originalQuery, relevantResults, iteration) {
    logger.info(`Refining query: "${originalQuery}" (iteration: ${iteration})`)
    try {
      const resultsSummary =
        relevantResults.length > 0
          ? relevantResults
              .slice(0, 3)
              .map(r => `"${(r.title || r.content || '').slice(0, 100)}..."`)
              .join(', ')
          : 'No relevant results found'

      const prompt = `You are a search query refinement expert. Your task is to IMPROVE the search query while PRESERVING the original intent.

ORIGINAL USER QUERY: "${originalQuery}"
Iteration: ${iteration + 1}
Relevant results found so far: ${resultsSummary}

Create a BETTER search query that:
1. Preserves the core intent
2. Can add related terms or synonyms to improve results
3. Should be more specific if results were too broad
4. Can be more general ONLY if no results were found
5. Must maintain the original query's core intent
6. Should use natural language that would appear in Reddit discussions

CRITICAL: The refined query MUST still be about: ${originalQuery}

Return:
- refinedQuery
- preservesIntent
- confidence (0 to 1)`

      const result = await generateText({
        model: this.model,
        prompt: prompt,
        maxOutputTokens: this.maxOutputTokens,
        maxRetries: 0,
        abortSignal: createAbortSignal(this.timeoutMs),
        output: Output.object({
          schema: QueryRefinementAgent.QUERY_REFINEMENT_OUTPUT_SCHEMA,
        }),
        providerOptions: {
          openai: {
            reasoningEffort: 'none',
          },
        },
      })

      const parsed = result.output
      if (!parsed?.refinedQuery) return null
      if (parsed.preservesIntent === false && (parsed.confidence || 0) < 0.6) {
        logger.warn('Refined query flagged as intent drift; not searching with it')
        return null
      }
      return parsed.refinedQuery.trim()
    } catch (error) {
      logger.error('Error refining query:', error)
      return null
    }
  }
}

module.exports = AgenticRAGService
module.exports.QueryRefinementAgent = QueryRefinementAgent
