const KnowledgeBase = require('./knowledge-base')
const { generateText } = require('ai')
const { openai } = require('@ai-sdk/openai')
const logger = require('../utils/logger')

class AgenticRAGService {
  constructor(options = {}) {
    this.knowledgeBase = new KnowledgeBase()
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 6000

    this.thinkingBudget = options.thinkingBudget !== undefined ? options.thinkingBudget : 1024

    this.chatModel = openai('gpt-5-mini')

    this.maxIterations = 3
    this.relevanceThreshold = 0.6
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
        sources: this.formatSources(agenticResult.relevantResults.slice(0, 8)),
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

    const relevanceAgent = new QueryRelevanceAgent(this.chatModel, 512, { includeThoughts })
    const refinementAgent = new QueryRefinementAgent(this.chatModel, 512, { includeThoughts })
    const qualityAgent = new ResultQualityAgent(this.chatModel, 512, { includeThoughts })

    let bestResults = []
    let maxRelevanceScore = 0
    const attempts = []
    const queriesUsed = []

    let failedRefinements = 0
    const MAX_FAILED_REFINEMENTS = 1 // Allow only 1 failed refinement before giving up

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

      const searchResults = await this.knowledgeBase.search(currentQuery, 30)

      if (searchResults.length === 0) {
        logger.info(`No results found for query: "${currentQuery}"`)
        continue
      }

      const relevanceScores = await relevanceAgent.analyzeRelevance(originalQuery, searchResults)

      const relevantResults = this.selectRelevantResults(
        originalQuery,
        searchResults
          .map((result, index) => ({
            ...result,
            relevanceScore: relevanceScores[index] || 0,
          }))
      )

      logger.info(
        `Found ${relevantResults.length} relevant results out of ${searchResults.length} total`
      )

      if (relevantResults.length > 0) {
        const avgRelevance =
          relevantResults.reduce((sum, r) => sum + r.relevanceScore, 0) / relevantResults.length

        const qualityScore = await qualityAgent.assessQuality(originalQuery, relevantResults)

        logger.info(
          `Average relevance: ${avgRelevance.toFixed(2)}, Quality score: ${qualityScore.toFixed(2)}`
        )

        if (avgRelevance > maxRelevanceScore) {
          maxRelevanceScore = avgRelevance
          bestResults = relevantResults
        }

        if (avgRelevance > 0.8 && qualityScore > 0.8 && relevantResults.length >= 5) {
          logger.info('High-quality results found, stopping search')
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

    return scoredResults
        .map((result, index) => ({
          ...result,
          resultIndex: index,
          relevanceScore: this.scoreResultRelevance(result, queryTerms),
        }))
        .filter(result => {
          const titleMatches = this.countTermMatches(result.title, queryTerms)
          const contentMatches = this.countTermMatches(result.content, queryTerms)
          const lexicalMatches = titleMatches + contentMatches
          const similarity = Math.max(0, Math.min(1, Number(result.similarity) || 0))

          if (result.relevanceScore < this.relevanceThreshold) return false

          // Keep semantically very strong hits even without literal overlap, but reject weak fuzzy matches.
          if (lexicalMatches === 0 && similarity < 0.78) return false

          return true
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 12)
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
      const cleaned = query.toLowerCase().replace(/[^\w\s]|_/g, '')

      const stopWords = new Set([
        'about',
        'what',
        'where',
        'when',
        'how',
        'tell',
        'need',
        'want',
        'with',
        'from',
        'into',
        'during',
        'including',
        'until',
        'against',
        'among',
        'throughout',
        'despite',
        'towards',
        'upon',
        'concerning',
        'like',
        'than',
        'that',
        'which',
        'whom',
        'whose',
        'whether',
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'if',
        'because',
        'as',
        'until',
        'while',
        'of',
        'at',
        'by',
        'for',
        'with',
        'about',
        'between',
        'into',
        'through',
        'to',
        'in',
        'on',
        'at',
        'from',
        'up',
        'down',
        'off',
        'over',
        'under',
        'again',
        'further',
        'then',
        'once',
        'here',
        'there',
        'when',
        'where',
        'why',
        'how',
        'all',
        'any',
        'both',
        'each',
        'few',
        'more',
        'most',
        'other',
        'some',
        'such',
        'no',
        'nor',
        'not',
        'only',
        'own',
        'same',
        'so',
        'than',
        'too',
        'very',
        'can',
        'will',
        'just',
        'don',
        'should',
        'now',
        'd',
      ])

      const terms = cleaned
        .split(/\s+/)
        .filter(
          term => term.length >= 3 && !stopWords.has(term) && !/^\d+$/.test(term) // Exclude numbers
        )
        .slice(0, 5) // Limit to 5 key terms

      if (terms.length === 0) {
        return cleaned
          .split(/\s+/)
          .filter(term => term.length >= 3)
          .slice(0, 3)
      }

      return terms
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

    const sortedResults = searchResults.sort(
      (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
    )

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

  countTermMatches(text, queryTerms) {
    if (!text || !queryTerms.length) return 0

    const haystack = String(text).toLowerCase()
    let matches = 0

    for (const term of queryTerms) {
      if (haystack.includes(term)) matches++
    }

    return matches
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
    const strategyPenalty =
      result.sourceStrategy === 'keywords' && lexicalCoverage < 0.5
        ? 0.9
        : 1

    return Math.min(
      1,
      (
        llmRelevance * 0.5 +
        lexicalCoverage * 0.25 +
        similarity * 0.15 +
        rankingScore * 0.05 +
        contentQuality * 0.05
      ) * strategyPenalty
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

  async generateAIResponse(query, context, conversationHistory, agenticResult) {
    const searchInfo =
      agenticResult.attempts.length > 1
        ? `Search refined ${agenticResult.attempts.length} times to find the most relevant results.`
        : 'Direct search results found.'
    const systemPrompt = `You are a comprehensive student assistant analyzing Reddit discussions about student life. Your goal is to provide detailed, informative responses that fully cover the topic.

Generate a rich, well-structured response in HTML format. Follow this EXACT structure but EXPAND each section with detailed information:

<div class="reddit-response">
<h3>Overview</h3>
<p>Provide a comprehensive 2-3 sentence summary that directly answers the question and sets context for what follows.</p>

<h3>Student Experiences</h3>
<ul>
<li><strong>Personal Experience:</strong> Detailed account from <span style="color: #0066cc; font-weight: 500;">u/username</span> <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span> - include specific details, numbers, timeframes, and practical insights they shared.</li>
<li><strong>Alternative Perspective:</strong> Different viewpoint with specific details and reasoning from another user with proper attribution.</li>
<li><strong>Additional Insights:</strong> More experiences, tips, or observations from other students, including any warnings or recommendations.</li>
<li><strong>Recent Updates:</strong> Any recent developments or changes mentioned in the discussions.</li>
</ul>

<h3>Important Details & Practical Information</h3>
<ul>
<li><strong>Key Requirements:</strong> Specific requirements, procedures, or prerequisites students need to know.</li>
<li><strong>Timing & Deadlines:</strong> Important dates, timeframes, or scheduling considerations.</li>
<li><strong>Costs & Fees:</strong> Any financial information, pricing, or cost-related details mentioned.</li>
<li><strong>Location & Access:</strong> Where things are located, how to access services, or physical details.</li>
<li><strong>Tips & Tricks:</strong> Practical advice, shortcuts, or insider knowledge shared by students.</li>
<li><strong>Common Mistakes:</strong> Pitfalls to avoid or frequent errors mentioned in discussions.</li>
</ul>

<h3>Important Considerations</h3>
<ul>
<li><strong>Potential Issues:</strong> Problems, challenges, or difficulties students have encountered.</li>
<li><strong>Quality Concerns:</strong> Any mentions of quality, reliability, or satisfaction levels.</li>
<li><strong>Alternatives:</strong> Other options, backup plans, or substitute approaches discussed.</li>
<li><strong>Recent Changes:</strong> Any updates, policy changes, or evolving situations.</li>
</ul>

<h3>Bottom Line & Recommendations</h3>
<p><strong>Summary:</strong> Comprehensive conclusion that synthesizes all the information and provides clear, actionable advice for students.</p>
<p><strong>Best Approach:</strong> Specific recommendation on the optimal course of action based on the collective student experiences.</p>
<p><strong>Pro Tip:</strong> One key insight or piece of advice that stands out from the discussions.</p>
</div>

CRITICAL RULES FOR DETAILED RESPONSES:
- Output ONLY HTML - no markdown, no code blocks, no backticks  
- Use the exact structure shown above but FILL IT WITH COMPREHENSIVE DETAILS
- Always cite sources with real usernames and upvote counts from the context
- Extract ALL relevant information from the context - don't leave out useful details
- Include specific numbers, dates, prices, locations, and procedures when mentioned
- Mention multiple student perspectives and experiences, not just one
- Use proper HTML tags, NOT markdown
- Do not hallucinate usernames or upvote counts - only use what's provided in context
- Base response entirely on the provided context but be thorough in extracting information
- If a section doesn't have relevant information from context, you can omit that specific subsection
- Prioritize actionable, specific information over generic advice
- ${searchInfo}

Context: ${context}`

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
      content: query,
    })

    try {
      const result = await generateText({
        model: this.chatModel,
        messages: messages,
        maxTokens: 4500,
        temperature: 0.7,
      })

      let cleanResponse = result.text
        .replace(/```html\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/`/g, '')
        .trim()

      if (!cleanResponse.includes('reddit-response')) {
        cleanResponse = `<div class="reddit-response">${cleanResponse}</div>`
      }

      return cleanResponse
    } catch (error) {
      logger.error('Error generating AI response:', error)
      return '<div class="reddit-response"><p>I apologize, but I encountered an error while generating a response. Please try again.</p></div>'
    }
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
  constructor(model, thinkingBudget = 512, options = {}) {
    this.model = model
    this.thinkingBudget = thinkingBudget
    this.includeThoughts = options.includeThoughts || false
    logger.info(
      `QueryRelevanceAgent initialized with thinkingBudget: ${thinkingBudget}, includeThoughts: ${this.includeThoughts}`
    )
  }

  async analyzeRelevance(originalQuery, searchResults) {
    logger.info(
      `Analyzing relevance for query: "${originalQuery}" with ${searchResults.length} results, thinkingBudget: ${this.thinkingBudget}`
    )
    try {
      const resultsText = searchResults
        .map((result, index) =>
          `Result ${index}: ${result.title || ''} ${result.content || ''}`.slice(0, 200)
        )
        .join('\n')

      const prompt = `Analyze how relevant each search result is to the original query. Rate each result's relevance from 0.0 to 1.0.

Original Query: "${originalQuery}"

Search Results:
${resultsText}

For each result, consider:
- How directly it answers the query
- How specific and useful the information is
- How recent and credible it appears

Respond with ONLY a JSON array of relevance scores (0.0-1.0), one for each result:
[0.8, 0.2, 0.9, 0.1, ...]`

      const result = await generateText({
        model: this.model,
        prompt: prompt,
        maxTokens: 500,
        temperature: 0.3,
      })

      try {
        const scores = this.parseScores(result.text)
        if (Array.isArray(scores) && scores.length === searchResults.length) {
          const queryTerms = AgenticRAGService.extractKeyTerms(originalQuery)
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
      } catch (e) {
        logger.warn('Failed to parse relevance scores, using fallback')
      }

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

        return Math.min(1, Math.max(0.2, lexicalCoverage * 0.45 + similarity * 0.4 + rankingScore * 0.15))
      })
    } catch (error) {
      logger.error('Error in relevance analysis:', error)
      return searchResults.map(() => 0.5)
    }
  }

  countTermMatches(text, queryTerms) {
    if (!text || !queryTerms.length) return 0

    const haystack = String(text).toLowerCase()
    let matches = 0

    for (const term of queryTerms) {
      if (haystack.includes(term)) matches++
    }

    return matches
  }

  parseScores(text) {
    if (!text) return null

    const cleaned = String(text).trim()
    const direct = this.tryParseJson(cleaned)
    if (Array.isArray(direct)) return direct

    const withoutFences = cleaned
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim()
    const fenceParsed = this.tryParseJson(withoutFences)
    if (Array.isArray(fenceParsed)) return fenceParsed

    const match = withoutFences.match(/\[[\s\S]*\]/)
    if (match) {
      const matchedParsed = this.tryParseJson(match[0])
      if (Array.isArray(matchedParsed)) return matchedParsed
    }

    return null
  }

  tryParseJson(value) {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
}

class QueryRefinementAgent {
  constructor(model, thinkingBudget = 512, options = {}) {
    this.model = model
    this.thinkingBudget = thinkingBudget
    this.includeThoughts = options.includeThoughts || false
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
Key terms to preserve: ${keyTerms.join(', ')}
Iteration: ${iteration + 1}
Current Results: ${resultsSummary}

Create a BETTER search query that:
1. MUST include ALL key terms from the original query (${keyTerms.join(', ')})
2. Can add related terms or synonyms to improve results
3. Should be more specific if results were too broad
4. Can be more general ONLY if no results were found
5. Must maintain the original query's core intent
6. Should use natural language that would appear in Reddit discussions

CRITICAL: The refined query MUST still be about: ${originalQuery}

Respond with ONLY the improved search query, no explanation or formatting.`

      const result = await generateText({
        model: this.model,
        prompt: prompt,
        maxTokens: 50,
        temperature: 0.3, // Lower temperature for more focused results
      })

      const refinedQuery = result.text.trim().replace(/['"]/g, '')

      const missingTerms = keyTerms.filter(
        term => !refinedQuery.toLowerCase().includes(term.toLowerCase())
      )

      if (missingTerms.length > 0) {
        logger.warn(
          `Refined query is missing key terms: ${missingTerms.join(', ')}. Falling back to original query.`
        )
        return originalQuery
      }

      return refinedQuery
    } catch (error) {
      logger.error('Error refining query:', error)
      const keywords = originalQuery.split(' ').filter(word => word.length > 3)
      return keywords.slice(0, 3).join(' ')
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
