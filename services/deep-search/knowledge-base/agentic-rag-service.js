const KnowledgeBase = require('./knowledge-base')
const { generateText, Output } = require('ai')
const { openai } = require('@ai-sdk/openai')
const { z } = require('zod')
const logger = require('../utils/logger')

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

class AgenticRAGService {
  constructor(options = {}) {
    this.knowledgeBase = new KnowledgeBase()
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH || '3200', 10)
    this.searchLimit = parseInt(process.env.AGENTIC_SEARCH_LIMIT || '20', 10)
    this.relevanceCandidateLimit = parseInt(process.env.AGENTIC_RELEVANCE_CANDIDATES || '15', 10)
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
    this.firstPassMinResults = parsePositiveInt(process.env.AGENTIC_FIRST_PASS_MIN_RESULTS, 4)
    this.firstPassMinAvgRelevance = parseFraction(
      process.env.AGENTIC_FIRST_PASS_MIN_AVG_RELEVANCE,
      0.5
    )
    this.firstPassMinQuality = parseFraction(process.env.AGENTIC_FIRST_PASS_MIN_QUALITY, 0.58)
    this.firstPassMinLexicalCoverage = parseFraction(
      process.env.AGENTIC_FIRST_PASS_MIN_LEXICAL_COVERAGE,
      0.38
    )

    this.thinkingBudget = options.thinkingBudget !== undefined ? options.thinkingBudget : 1024

    this.chatModel = openai('gpt-5.4-mini')

    this.maxIterations = 2
    this.relevanceThreshold = 0.5
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
        confidence: this.calculateConfidence(
          agenticResult.relevantResults,
          agenticResult.maxRelevanceScore
        ),
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

  async agenticSearch(originalQuery, options = {}) {
    const { includeThoughts = false } = options

    if (includeThoughts) {
      logger.info('Thought logging is enabled for this search session')
    }

    logger.info(`Starting agentic search for: "${originalQuery}"`)

    const relevanceAgent = new QueryRelevanceAgent(this.chatModel, 512, {
      includeThoughts,
      timeoutMs: this.relevanceTimeoutMs,
    })
    const refinementAgent = new QueryRefinementAgent(this.chatModel, 512, {
      includeThoughts,
      timeoutMs: this.refinementTimeoutMs,
    })
    const qualityAgent = new ResultQualityAgent(this.chatModel, 512, { includeThoughts })

    let bestResults = []
    let maxRelevanceScore = 0
    let bestSelectionScore = 0
    const attempts = []
    const queriesUsed = []

    let failedRefinements = 0
    const MAX_FAILED_REFINEMENTS = 2

    for (let i = 0; i < this.maxIterations; i++) {
      let currentQuery

      if (i === 0) {
        currentQuery = originalQuery
      } else {
        if (failedRefinements >= MAX_FAILED_REFINEMENTS) {
          logger.info('Too many failed refinements, using best results so far')
          break
        }

        const refinedQuery = await this.getNextQuery(originalQuery, bestResults, refinementAgent, i)

        if (
          !refinedQuery ||
          queriesUsed.includes(refinedQuery) ||
          refinedQuery === originalQuery ||
          refinedQuery.length < 5
        ) {
          logger.info('Query refinement exhausted, duplicate, or invalid')
          failedRefinements++
          continue
        }

        currentQuery = refinedQuery
      }

      queriesUsed.push(currentQuery)
      attempts.push({ iteration: i, query: currentQuery })

      logger.info(`Iteration ${i + 1}: Searching with query: "${currentQuery}"`)

      const searchResults = await this.knowledgeBase.search(currentQuery, this.searchLimit)

      if (searchResults.length === 0) {
        logger.info(`No results found for query: "${currentQuery}"`)
        continue
      }

      const relevanceCandidates = searchResults.slice(0, this.relevanceCandidateLimit)
      const heuristicScores = relevanceCandidates.map(result =>
        this.estimateRelevanceFromRetrieval(originalQuery, result)
      )
      const useLlmRelevance = i === 0 && relevanceAgent.shouldUseLlmRelevance(heuristicScores)
      const relevanceStart = Date.now()
      const relevanceScores = useLlmRelevance
        ? await relevanceAgent.analyzeRelevance(originalQuery, relevanceCandidates, heuristicScores)
        : heuristicScores
      logger.info(
        `Relevance scoring mode=${useLlmRelevance ? 'llm' : 'heuristic'} took ${Date.now() - relevanceStart}ms`
      )

      const relevantResults = this.selectRelevantResults(
        originalQuery,
        relevanceCandidates
          .map((result, index) => ({
            ...result,
            relevanceScore: relevanceScores[index] || 0,
          }))
      )

      logger.info(
        `Found ${relevantResults.length} relevant results out of ${relevanceCandidates.length} ranked candidates`
      )

      if (relevantResults.length > 0) {
        const avgRelevance =
          relevantResults.reduce((sum, r) => sum + r.relevanceScore, 0) / relevantResults.length
        const avgLexicalCoverage = this.calculateAverageLexicalCoverage(
          originalQuery,
          relevantResults
        )

        const qualityScore = await qualityAgent.assessQuality(originalQuery, relevantResults)

        logger.info(
          `Average relevance: ${avgRelevance.toFixed(2)}, Quality score: ${qualityScore.toFixed(2)}, Lexical coverage: ${avgLexicalCoverage.toFixed(2)}`
        )

        const coverageScore = Math.min(
          1,
          relevantResults.length / Math.max(4, this.relevanceCandidateLimit)
        )
        const selectionScore = avgRelevance * 0.45 + qualityScore * 0.35 + coverageScore * 0.2

        if (
          selectionScore > bestSelectionScore ||
          (Math.abs(selectionScore - bestSelectionScore) < 1e-6 &&
            relevantResults.length > bestResults.length)
        ) {
          bestSelectionScore = selectionScore
          maxRelevanceScore = avgRelevance
          bestResults = relevantResults
        }

        if (
          (i === 0 &&
            relevantResults.length >= this.firstPassMinResults &&
            avgRelevance >= this.firstPassMinAvgRelevance &&
            qualityScore >= this.firstPassMinQuality &&
            avgLexicalCoverage >= this.firstPassMinLexicalCoverage) ||
          (avgRelevance > 0.72 && qualityScore > 0.72 && relevantResults.length >= 4)
        ) {
          logger.info('Sufficient quality reached, stopping search early')
          break
        }
      }
    }

    return {
      success: bestResults.length > 0,
      relevantResults: bestResults,
      maxRelevanceScore,
      attempts,
      queriesUsed,
    }
  }

  selectRelevantResults(originalQuery, scoredResults) {
    const queryTerms = AgenticRAGService.extractKeyTerms(originalQuery)
    const rescoredResults = scoredResults.map((result, index) => ({
      ...result,
      resultIndex: index,
      relevanceScore: this.scoreResultRelevance(result, queryTerms),
    }))

    const topScore = rescoredResults.reduce(
      (maxScore, item) => Math.max(maxScore, Number(item.relevanceScore) || 0),
      0
    )
    let effectiveThreshold = this.relevanceThreshold

    if (topScore > 0 && topScore < this.relevanceThreshold) {
      effectiveThreshold = Math.max(0.25, topScore * 0.8)
      logger.info(
        `Adaptive relevance threshold enabled: topScore=${topScore.toFixed(3)}, base=${this.relevanceThreshold.toFixed(3)}, effective=${effectiveThreshold.toFixed(3)}`
      )
    }

    const selected = rescoredResults
      .filter(result => {
        const titleMatches = this.countTermMatches(result.title, queryTerms)
        const contentMatches = this.countTermMatches(result.content, queryTerms)
        const lexicalMatches = titleMatches + contentMatches
        const lexicalCoverage = queryTerms.length > 0 ? lexicalMatches / queryTerms.length : 0
        const similarity = Math.max(0, Math.min(1, Number(result.similarity) || 0))
        const rankingScore = Math.max(0, Math.min(1, Number(result.rankingScore) || 0))

        if (result.relevanceScore < effectiveThreshold) return false

        // Keep semantic matches even when literal overlap is weak, but reject low-signal fuzz.
        if (
          lexicalMatches === 0 &&
          similarity < 0.45 &&
          result.relevanceScore < effectiveThreshold + 0.12
        ) {
          return false
        }

        // Reject low-coverage chunk noise unless ranking signal is very strong.
        if (
          result.type === 'chunk' &&
          lexicalCoverage < 0.34 &&
          rankingScore < 0.42 &&
          similarity < 0.72
        ) {
          return false
        }

        return true
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 12)

    if (selected.length > 0) return selected

    // Never return an empty set when retrieval produced candidates; keep the strongest signals.
    return rescoredResults
      .sort((a, b) => {
        const relevanceDelta = (b.relevanceScore || 0) - (a.relevanceScore || 0)
        if (Math.abs(relevanceDelta) > 1e-6) return relevanceDelta
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, Math.min(8, rescoredResults.length))
  }

  async getNextQuery(originalQuery, currentBestResults, refinementAgent, iteration) {
    try {
      const refinedQuery = await refinementAgent.refineQuery(
        originalQuery,
        currentBestResults,
        iteration
      )

      logger.info(`Generated refined query: "${refinedQuery}"`)
      return refinedQuery
    } catch (error) {
      logger.error('Error generating refined query:', error)
      return AgenticRAGService.extractKeyTerms(originalQuery).join(' ')
    }
  }

  static extractKeyTerms(query) {
    if (!query || typeof query !== 'string') return []

    try {
      const normalized = query
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!normalized) return []

      const terms = normalized
        .split(' ')
        .filter(term => term.length >= 3 && !/^\d+$/.test(term))

      return Array.from(new Set(terms)).slice(0, 8)
    } catch (error) {
      logger.error('Error extracting key terms:', error)
      return (query || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length >= 3)
        .slice(0, 3)
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

  prioritizeResponseResults(searchResults = [], minCount = 5) {
    const ranked = [...(Array.isArray(searchResults) ? searchResults : [])].sort((a, b) => {
      const typeScore = value => (value?.type === 'post' ? 2 : value?.type === 'comment' ? 1 : 0)
      const typeDelta = typeScore(b) - typeScore(a)
      if (typeDelta !== 0) return typeDelta

      const relevanceDelta = (Number(b?.relevanceScore) || 0) - (Number(a?.relevanceScore) || 0)
      if (Math.abs(relevanceDelta) > 1e-6) return relevanceDelta

      return (Number(b?.similarity) || 0) - (Number(a?.similarity) || 0)
    })

    const nonChunk = ranked.filter(item => item.type !== 'chunk')
    if (nonChunk.length === 0) return ranked

    const chunks = ranked.filter(item => item.type === 'chunk')
    const target = Math.min(ranked.length, Math.max(minCount, nonChunk.length))
    return [...nonChunk, ...chunks].slice(0, target)
  }

  countTermMatches(text, queryTerms) {
    if (!text || !queryTerms.length) return 0

    const haystack = String(text).toLowerCase()
    let matches = 0

    for (const term of queryTerms) {
      const escaped = String(term || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!escaped) continue
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i')
      if (pattern.test(haystack)) matches++
    }

    return matches
  }

  calculateAverageLexicalCoverage(query, results = []) {
    const queryTerms = AgenticRAGService.extractKeyTerms(query)
    if (!queryTerms.length || !Array.isArray(results) || results.length === 0) return 0

    const coverageSum = results.reduce((sum, item) => {
      const titleMatches = this.countTermMatches(item.title, queryTerms)
      const contentMatches = this.countTermMatches(item.content, queryTerms)
      const lexicalMatches = titleMatches + contentMatches
      return sum + lexicalMatches / queryTerms.length
    }, 0)

    return coverageSum / results.length
  }

  scoreResultRelevance(result, queryTerms) {
    const llmRelevance = Math.max(0, Math.min(1, Number(result.relevanceScore) || 0))
    const similarity = Math.max(0, Math.min(1, Number(result.similarity) || 0))
    const rankingScore = Math.max(0, Math.min(1, Number(result.rankingScore) || 0))
    const titleMatches = this.countTermMatches(result.title, queryTerms)
    const contentMatches = this.countTermMatches(result.content, queryTerms)
    const lexicalCoverage =
      queryTerms.length > 0
        ? Math.min(1, (titleMatches * 1.4 + contentMatches) / (queryTerms.length * 1.8))
        : 0
    const contentLength = (result.content || result.title || '').length
    const contentQuality = Math.min(1, contentLength / 220)
    const engagementBase = Math.max(0, Number(result.upvotes) || 0, Number(result.score) || 0)
    const engagementScore = Math.min(1, Math.log10(engagementBase + 1) / 3)
    const typeWeight = result.type === 'post' ? 1 : result.type === 'comment' ? 0.9 : 0.62
    const strategyPenalty =
      result.sourceStrategy === 'keywords' && lexicalCoverage < 0.5
        ? 0.9
        : 1

    return Math.min(
      1,
      (
        llmRelevance * 0.43 +
        lexicalCoverage * 0.24 +
        similarity * 0.12 +
        rankingScore * 0.11 +
        contentQuality * 0.04 +
        engagementScore * 0.06
      ) * strategyPenalty * typeWeight
    )
  }

  estimateRelevanceFromRetrieval(originalQuery, result) {
    const queryTerms = AgenticRAGService.extractKeyTerms(originalQuery)
    const titleMatches = this.countTermMatches(result.title, queryTerms)
    const contentMatches = this.countTermMatches(result.content, queryTerms)
    const lexicalCoverage =
      queryTerms.length > 0
        ? Math.min(1, (titleMatches * 1.4 + contentMatches) / (queryTerms.length * 1.8))
        : 0
    const similarity = Math.max(0, Math.min(1, parseFloat(result.similarity) || 0))
    const rankingScore = Math.max(0, Math.min(1, parseFloat(result.rankingScore) || 0))
    const contentQuality = Math.min(1, String(result.content || result.title || '').length / 220)
    const engagementBase = Math.max(0, Number(result.upvotes) || 0, Number(result.score) || 0)
    const engagementScore = Math.min(1, Math.log10(engagementBase + 1) / 3)
    const typeWeight = result.type === 'post' ? 1 : result.type === 'comment' ? 0.9 : 0.62

    return Math.min(
      1,
      Math.max(
        0.15,
        (lexicalCoverage * 0.42 +
          similarity * 0.22 +
          rankingScore * 0.23 +
          contentQuality * 0.05 +
          engagementScore * 0.08) *
          typeWeight
      )
    )
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
        const title = String(result.title || '').replace(/\s+/g, ' ').trim().slice(0, 120)
        const content = String(result.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)
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
    ).replace(/[<>]/g, '')}</strong>.</p><h3>Student Experiences</h3><ul>${items || '<li>No reliable sources found.</li>'}</ul><h3>Bottom Line & Recommendations</h3><p>Use the highest-upvoted and most recent threads first, then cross-check with official campus resources before acting.</p></div>`
  }

  async generateAIResponse(query, context, conversationHistory, agenticResult) {
    const searchInfo =
      agenticResult.attempts.length > 1
        ? `Search refined ${agenticResult.attempts.length} times to find the most relevant results.`
        : 'Direct search results found.'
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
- ${searchInfo}`

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ]

    conversationHistory.forEach(msg => {
      messages.push(msg)
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
        messages: messages,
        maxOutputTokens: this.responseMaxOutputTokens,
        maxRetries: 0,
        abortSignal: createAbortSignal(this.responseTimeoutMs),
        output: Output.text(),
        providerOptions: {
          openai: {
            reasoningEffort: 'minimal',
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
        messages: [
          { role: 'system', content: `${compactSystemPrompt}\n\nContext:\n${compactContext}` },
          { role: 'user', content: query },
        ],
        maxOutputTokens: this.responseRetryMaxOutputTokens,
        maxRetries: 0,
        abortSignal: createAbortSignal(this.responseRetryTimeoutMs),
        output: Output.text(),
        providerOptions: {
          openai: {
            reasoningEffort: 'minimal',
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

  calculateConfidence(searchResults, maxRelevanceScore) {
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

class QueryRelevanceAgent {
  static RELEVANCE_OUTPUT_SCHEMA = z.object({
    scores: z.array(z.number().min(0).max(1)),
  })

  constructor(model, thinkingBudget = 512, options = {}) {
    this.model = model
    this.thinkingBudget = thinkingBudget
    this.includeThoughts = options.includeThoughts || false
    this.timeoutMs = parsePositiveInt(options.timeoutMs, 5000)
    this.maxOutputTokens = parsePositiveInt(options.maxOutputTokens, 192)
    logger.info(
      `QueryRelevanceAgent initialized with thinkingBudget: ${thinkingBudget}, includeThoughts: ${this.includeThoughts}`
    )
  }

  shouldUseLlmRelevance(heuristicScores = []) {
    if (!Array.isArray(heuristicScores) || heuristicScores.length === 0) return false

    const sorted = [...heuristicScores]
      .map(value => Math.max(0, Math.min(1, Number(value) || 0)))
      .sort((a, b) => b - a)
    const top1 = sorted[0] || 0
    const top3Avg =
      sorted.slice(0, Math.min(3, sorted.length)).reduce((sum, value) => sum + value, 0) /
      Math.min(3, sorted.length)
    const spread = (sorted[0] || 0) - (sorted[Math.min(4, sorted.length - 1)] || 0)

    // Skip LLM relevance unless retrieval confidence is genuinely ambiguous.
    if (top1 >= 0.62 && top3Avg >= 0.5) return false
    return spread < 0.12 || top3Avg < 0.48
  }

  formatForLog(value) {
    if (value == null) return 'unknown'
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  estimateFallbackScores(originalQuery, searchResults) {
    const queryTerms = AgenticRAGService.extractKeyTerms(originalQuery)
    return searchResults.map(result => {
      const titleMatches = this.countTermMatches(result.title, queryTerms)
      const contentMatches = this.countTermMatches(result.content, queryTerms)
      const lexicalCoverage =
        queryTerms.length > 0
          ? Math.min(1, (titleMatches * 1.4 + contentMatches) / (queryTerms.length * 1.8))
          : 0
      const similarity = Math.max(0, Math.min(1, parseFloat(result.similarity) || 0))
      const rankingScore = Math.max(0, Math.min(1, parseFloat(result.rankingScore) || 0))
      const engagementBase = Math.max(0, Number(result.upvotes) || 0, Number(result.score) || 0)
      const engagementScore = Math.min(1, Math.log10(engagementBase + 1) / 3)
      const typeWeight = result.type === 'post' ? 1 : result.type === 'comment' ? 0.9 : 0.62

      return Math.min(
        1,
        Math.max(
          0.15,
          (lexicalCoverage * 0.42 + similarity * 0.22 + rankingScore * 0.28 + engagementScore * 0.08) *
            typeWeight
        )
      )
    })
  }

  async analyzeRelevance(originalQuery, searchResults, precomputedFallbackScores = null) {
    logger.info(
      `Analyzing relevance for query: "${originalQuery}" with ${searchResults.length} results, thinkingBudget: ${this.thinkingBudget}`
    )
    const fallbackScores =
      Array.isArray(precomputedFallbackScores) &&
      precomputedFallbackScores.length === searchResults.length
        ? precomputedFallbackScores
        : this.estimateFallbackScores(originalQuery, searchResults)

    try {
      if (searchResults.length === 0) {
        return []
      }

      const resultsText = searchResults
        .map((result, index) =>
          `Result ${index}: title="${String(result.title || '').slice(0, 90)}" excerpt="${String(
            result.content || ''
          )
            .replace(/\s+/g, ' ')
            .slice(0, 70)}"`
        )
        .join('\n')

      const prompt = `Score each result for relevance to the user query. Return only the schema output.

Original Query: "${originalQuery}"

Search Results:
${resultsText}

Rules:
- Return exactly ${searchResults.length} scores.
- Each score must be a number from 0 to 1.
- Preserve input order.`

      const result = await generateText({
        model: this.model,
        prompt: prompt,
        maxOutputTokens: this.maxOutputTokens,
        maxRetries: 0,
        abortSignal: createAbortSignal(this.timeoutMs),
        output: Output.object({
          schema: QueryRelevanceAgent.RELEVANCE_OUTPUT_SCHEMA,
        }),
        providerOptions: {
          openai: {
            reasoningEffort: 'minimal',
          },
        },
      })

      const scores = result.output?.scores
      if (Array.isArray(scores) && scores.length > 0) {
        const normalizedScores = scores.slice(0, searchResults.length)
        const padValue = Math.max(
          0,
          Math.min(1, Number(normalizedScores[normalizedScores.length - 1]) || 0.5)
        )
        while (normalizedScores.length < searchResults.length) {
          normalizedScores.push(padValue)
        }

        const queryTerms = AgenticRAGService.extractKeyTerms(originalQuery)
        return this.blendRelevanceScores(normalizedScores, searchResults, queryTerms)
      }

      const warningCount = Array.isArray(result?.warnings) ? result.warnings.length : 0
      logger.warn(
        `Structured relevance output missing (finishReason=${this.formatForLog(result?.finishReason)}, warnings=${warningCount}), using heuristic fallback`
      )
      return fallbackScores
    } catch (error) {
      logger.error('Error in relevance analysis:', error)
      return fallbackScores
    }
  }

  blendRelevanceScores(scores, searchResults, queryTerms) {
    return scores.map((score, index) => {
      const llmScore = Math.max(0, Math.min(1, parseFloat(score) || 0))
      const item = searchResults[index] || {}
      const titleMatches = this.countTermMatches(item.title, queryTerms)
      const contentMatches = this.countTermMatches(item.content, queryTerms)
      const lexicalCoverage =
        queryTerms.length > 0
          ? Math.min(1, (titleMatches * 1.4 + contentMatches) / (queryTerms.length * 1.8))
          : 0
      const similarity = Math.max(0, Math.min(1, parseFloat(item.similarity) || 0))
      const rankingScore = Math.max(0, Math.min(1, parseFloat(item.rankingScore) || 0))

      return Math.min(
        1,
        llmScore * 0.65 + lexicalCoverage * 0.2 + similarity * 0.1 + rankingScore * 0.05
      )
    })
  }

  countTermMatches(text, queryTerms) {
    if (!text || !queryTerms.length) return 0

    const haystack = String(text).toLowerCase()
    let matches = 0

    for (const term of queryTerms) {
      const escaped = String(term || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (!escaped) continue
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i')
      if (pattern.test(haystack)) matches++
    }

    return matches
  }

}
 
class QueryRefinementAgent {
  static QUERY_REFINEMENT_OUTPUT_SCHEMA = z.object({
    refinedQuery: z.string().min(5),
    preservesIntent: z.boolean(),
    confidence: z.number().min(0).max(1),
  })

  constructor(model, thinkingBudget = 512, options = {}) {
    this.model = model
    this.thinkingBudget = thinkingBudget
    this.includeThoughts = options.includeThoughts || false
    this.timeoutMs = parsePositiveInt(options.timeoutMs, 3500)
    this.maxOutputTokens = parsePositiveInt(options.maxOutputTokens, 96)
    logger.info(
      `QueryRefinementAgent initialized with thinkingBudget: ${thinkingBudget}, includeThoughts: ${this.includeThoughts}`
    )
  }

  async refineQuery(originalQuery, currentResults, iteration) {
    logger.info(
      `Refining query: "${originalQuery}" (iteration: ${iteration}), thinkingBudget: ${this.thinkingBudget}`
    )
    try {
      const resultsSummary =
        currentResults.length > 0
          ? currentResults
              .slice(0, 3)
              .map(r => `"${(r.title || r.content || '').slice(0, 100)}..."`)
              .join(', ')
          : 'No relevant results found'

      const keyTerms = AgenticRAGService.extractKeyTerms(originalQuery)

      const prompt = `You are a search query refinement expert. Your task is to IMPROVE the search query while PRESERVING the original intent.

ORIGINAL USER QUERY: "${originalQuery}"
Original key terms: ${keyTerms.join(', ')}
Iteration: ${iteration + 1}
Current Results: ${resultsSummary}

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
            reasoningEffort: 'minimal',
          },
        },
      })

      const parsed = result.output
      if (parsed && parsed.refinedQuery && parsed.refinedQuery.length >= 5) {
        if (parsed.preservesIntent === false && (parsed.confidence || 0) < 0.6) {
          logger.warn('Refined query flagged as intent drift; using original query')
          return originalQuery
        }

        return parsed.refinedQuery.trim()
      }

      return originalQuery
    } catch (error) {
      logger.error('Error refining query:', error)
      return originalQuery
    }
  }

}

class ResultQualityAgent {
  constructor(model, thinkingBudget = 512, options = {}) {
    this.model = model
    this.thinkingBudget = thinkingBudget
    this.includeThoughts = options.includeThoughts || false
    logger.info(
      `ResultQualityAgent initialized with thinkingBudget: ${thinkingBudget}, includeThoughts: ${this.includeThoughts}`
    )
  }

  async assessQuality(originalQuery, results) {
    logger.info(
      `Assessing quality for query: "${originalQuery}" with ${results.length} results, thinkingBudget: ${this.thinkingBudget}`
    )
    try {
      const resultsInfo = results.slice(0, 5).map(r => ({
        upvotes: r.upvotes || 0,
        score: r.score || 0,
        hasContent: (r.content || '').length > 50,
        relevance: r.relevanceScore || 0,
      }))

      let qualityScore = 0

      if (results.length >= 3) qualityScore += 0.3

      const avgUpvotes = resultsInfo.reduce((sum, r) => sum + r.upvotes, 0) / resultsInfo.length
      if (avgUpvotes > 10) qualityScore += 0.3

      const contentRatio = resultsInfo.filter(r => r.hasContent).length / resultsInfo.length
      qualityScore += contentRatio * 0.2

      const avgRelevance = resultsInfo.reduce((sum, r) => sum + r.relevance, 0) / resultsInfo.length
      qualityScore += avgRelevance * 0.2

      return Math.min(1.0, qualityScore)
    } catch (error) {
      logger.error('Error assessing quality:', error)
      return 0.5
    }
  }
}

module.exports = AgenticRAGService
