const KnowledgeBase = require('./knowledge-base')
const { generateText } = require('ai')
const { google } = require('@ai-sdk/google')
const logger = require('../utils/logger')

class AgenticRAGService {
  constructor() {
    this.knowledgeBase = new KnowledgeBase()
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 6000
    this.chatModel = google('gemini-2.5-flash-lite-preview-06-17')
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

  async agenticSearch(originalQuery) {
    logger.info(`Starting agentic search for: "${originalQuery}"`)

    let bestResults = []
    let maxRelevanceScore = 0
    let attempts = 0
    let queriesUsed = [originalQuery]

    // Agent 1: Query Relevance Analyzer
    const relevanceAgent = new QueryRelevanceAgent(this.chatModel)

    // Agent 2: Query Refinement Generator
    const refinementAgent = new QueryRefinementAgent(this.chatModel)

    // Agent 3: Result Quality Assessor
    const qualityAgent = new ResultQualityAgent(this.chatModel)

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      attempts++
      const currentQuery =
        iteration === 0
          ? originalQuery
          : await this.getNextQuery(originalQuery, bestResults, refinementAgent, iteration)

      if (iteration > 0) {
        queriesUsed.push(currentQuery)
      }

      logger.info(`Iteration ${iteration + 1}: Searching with query: "${currentQuery}"`)

      const searchResults = await this.knowledgeBase.search(currentQuery, 30)

      if (searchResults.length === 0) {
        logger.info(`No results found for query: "${currentQuery}"`)
        continue
      }

      const relevanceScores = await relevanceAgent.analyzeRelevance(originalQuery, searchResults)

      const relevantResults = searchResults
        .map((result, index) => ({
          ...result,
          relevanceScore: relevanceScores[index] || 0,
        }))
        .filter(result => result.relevanceScore > this.relevanceThreshold)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)

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
      return this.extractKeywords(originalQuery).join(' ')
    }
  }

  extractKeywords(query) {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(
        word =>
          word.length > 3 &&
          !['about', 'what', 'where', 'when', 'how', 'tell', 'need', 'want'].includes(word)
      )
      .slice(0, 3)
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
      agenticResult.attempts > 1
        ? `Search refined ${agenticResult.attempts} times to find the most relevant results.`
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

    // Calculate confidence based on:
    // 1. Number of relevant results
    // 2. Average relevance score
    // 3. Average upvotes/score
    // 4. Diversity of sources

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
  constructor(model) {
    this.model = model
  }

  async analyzeRelevance(originalQuery, searchResults) {
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
        const scores = JSON.parse(result.text)
        if (Array.isArray(scores) && scores.length === searchResults.length) {
          return scores.map(score => Math.max(0, Math.min(1, parseFloat(score) || 0)))
        }
      } catch (e) {
        logger.warn('Failed to parse relevance scores, using fallback')
      }

      return searchResults.map(result =>
        Math.max(0.3, Math.min(0.9, parseFloat(result.similarity) || 0.5))
      )
    } catch (error) {
      logger.error('Error in relevance analysis:', error)
      return searchResults.map(() => 0.5)
    }
  }
}

class QueryRefinementAgent {
  constructor(model) {
    this.model = model
  }

  async refineQuery(originalQuery, currentResults, iteration) {
    try {
      const resultsSummary =
        currentResults.length > 0
          ? currentResults
              .slice(0, 3)
              .map(r => `"${(r.title || r.content || '').slice(0, 100)}..."`)
              .join(', ')
          : 'No relevant results found'

      const prompt = `You are a search query refinement expert. Improve the search query to find better Reddit discussions.

Original Query: "${originalQuery}"
Iteration: ${iteration + 1}
Current Results Summary: ${resultsSummary}

Create a better search query that:
- Uses different keywords or synonyms
- Is more specific if previous results were too broad
- Is more general if no results were found
- Focuses on the core intent of the original query
- Uses terms that are likely to appear in Reddit discussions

Respond with ONLY the improved search query, no explanation:`

      const result = await generateText({
        model: this.model,
        prompt: prompt,
        maxTokens: 50,
        temperature: 0.7,
      })

      return result.text.trim().replace(/['"]/g, '')
    } catch (error) {
      logger.error('Error refining query:', error)
      // Fallback refinement strategy
      const keywords = originalQuery.split(' ').filter(word => word.length > 3)
      return keywords.slice(0, 3).join(' ')
    }
  }
}

class ResultQualityAgent {
  constructor(model) {
    this.model = model
  }

  async assessQuality(originalQuery, results) {
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
