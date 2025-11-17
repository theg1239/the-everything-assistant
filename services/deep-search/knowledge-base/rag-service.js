const KnowledgeBase = require('./knowledge-base')
const { generateText } = require('ai')
const { google } = require('@ai-sdk/google')
const logger = require('../utils/logger')

class RAGService {
  constructor() {
    this.knowledgeBase = new KnowledgeBase()
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 4000
    this.chatModel = google('gemini-flash-latest')
  }
  async generateResponse(query, conversationHistory = []) {
    try {
      logger.info(`Generating RAG response for query: "${query}"`)

      const facultyPattern = /(?:professor|prof\.?|dr\.?|teacher)\s+([A-Z][a-z]+)/g
      const facultyNames = []
      let match
      while ((match = facultyPattern.exec(query)) !== null) {
        facultyNames.push(match[1])
      }
      let searchResults = []
      if (facultyNames.length > 0) {
        for (const name of facultyNames) {
          logger.info(`Detected faculty-specific query for "${name}", performing focused search.`)
          const facultyResults = await this.knowledgeBase.search(name, 40)
          if (facultyResults.length > 0) {
            searchResults = facultyResults
            break
          }
        }
      }
      if (searchResults.length === 0) {
        searchResults = await this.knowledgeBase.search(query, 40)
      }

      if (searchResults.length === 0) {
        logger.info('No direct results found, trying broader search...')

        const keywords = query
          .toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 3)
        let fallbackResults = []

        for (const keyword of keywords.slice(0, 5)) {
          const keywordResults = await this.knowledgeBase.search(keyword, 20)
          fallbackResults = fallbackResults.concat(keywordResults)
        }

        const topicKeywords = this.extractTopicKeywords(query)
        for (const topic of topicKeywords) {
          const topicResults = await this.knowledgeBase.search(topic, 10)
          fallbackResults = fallbackResults.concat(topicResults)
        }

        const diverseResults = this.diversifyResults(fallbackResults)

        if (diverseResults.length === 0) {
          return {
            response:
              "I couldn't find any relevant information in the Reddit knowledge base for your query. The database contains discussions from r/Vit, but nothing closely matches your search terms. Try rephrasing your question or asking about more general VIT topics.",
            sources: [],
            confidence: 0,
            searchResults: 0,
          }
        }

        const context = this.buildContext(diverseResults)
        const response = await this.generateAIResponse(query, context, conversationHistory, true)

        return {
          response: response,
          sources: this.formatSources(diverseResults.slice(0, 8)),
          confidence: this.calculateConfidence(diverseResults) * 0.7,
          searchResults: diverseResults.length,
          note: 'Results found using broader keyword search',
        }
      }

      const diverseResults = this.diversifyResults(searchResults)

      if (diverseResults.length < 5) {
        logger.info('Not enough diverse results, expanding search...')
        const keywords = query
          .toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 3)
        let expandedResults = [...searchResults]

        for (const keyword of keywords.slice(0, 3)) {
          const keywordResults = await this.knowledgeBase.search(keyword, 15)
          expandedResults = expandedResults.concat(keywordResults)
        }

        const expandedDiverse = this.diversifyResults(expandedResults)
        if (expandedDiverse.length > diverseResults.length) {
          const context = this.buildContext(expandedDiverse)
          const response = await this.generateAIResponse(query, context, conversationHistory)

          return {
            response: response,
            sources: this.formatSources(expandedDiverse.slice(0, 8)),
            confidence: this.calculateConfidence(expandedDiverse) * 0.9,
            searchResults: expandedDiverse.length,
          }
        }
      }

      const context = this.buildContext(diverseResults)
      const response = await this.generateAIResponse(query, context, conversationHistory)

      return {
        response: response,
        sources: this.formatSources(diverseResults.slice(0, 8)),
        confidence: this.calculateConfidence(diverseResults),
        searchResults: diverseResults.length,
      }
    } catch (error) {
      logger.error('Error generating RAG response:', error)
      return {
        response:
          'I apologize, but I encountered an error while searching the knowledge base. Please try again with a different query.',
        sources: [],
        confidence: 0,
        error: error.message,
      }
    }
  }

  extractTopicKeywords(query) {
    const topicMap = {
      library: ['study', 'books', 'reading', 'research', 'academic'],
      hostel: ['accommodation', 'room', 'warden', 'mess', 'facilities'],
      food: ['mess', 'dining', 'menu', 'cafeteria', 'canteen'],
      faculty: ['professor', 'teacher', 'staff', 'instructor'],
      placement: ['job', 'career', 'interview', 'company', 'recruitment'],
      exam: ['test', 'assessment', 'marks', 'grade', 'evaluation'],
      club: ['activity', 'event', 'society', 'organization'],
      campus: ['infrastructure', 'building', 'facility', 'location'],
    }

    const queryLower = query.toLowerCase()
    const topics = []

    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (queryLower.includes(topic) || keywords.some(keyword => queryLower.includes(keyword))) {
        topics.push(topic)
        topics.push(...keywords.slice(0, 2))
      }
    }

    return [...new Set(topics)]
  }
  diversifyResults(results) {
    const diverseResults = []
    const seenIds = new Set()
    const seenContentHashes = new Set()
    const seenTitles = new Set()
    const typeCount = { post: 0, comment: 0, chunk: 0 }
    const subredditCount = {}
    const authorCount = {}

    const normalizedResults = results.map(result => ({
      ...result,
      similarity: parseFloat(result.similarity) || 0,
    }))

    const sortedResults = normalizedResults.sort((a, b) => b.similarity - a.similarity)

    for (const result of sortedResults) {
      if (seenIds.has(result.reddit_id)) continue

      const contentHash = this.createContentHash(result.content || result.title || '')
      if (seenContentHashes.has(contentHash)) continue

      if (result.type === 'post' && result.title) {
        const titleKey = result.title.toLowerCase().slice(0, 50)
        if (seenTitles.has(titleKey)) continue
        seenTitles.add(titleKey)
      }

      if (typeCount[result.type] >= 6) continue

      const subredditKey = result.subreddit || 'unknown'
      if ((subredditCount[subredditKey] || 0) >= 5) continue

      const authorKey = result.author || 'unknown'
      if ((authorCount[authorKey] || 0) >= 2) continue

      diverseResults.push(result)
      seenIds.add(result.reddit_id)
      seenContentHashes.add(contentHash)
      typeCount[result.type]++
      subredditCount[subredditKey] = (subredditCount[subredditKey] || 0) + 1
      authorCount[authorKey] = (authorCount[authorKey] || 0) + 1

      if (diverseResults.length >= 15) break
    }

    return diverseResults
  }

  createContentHash(content) {
    if (!content) return ''

    const normalized = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return normalized.slice(0, 100)
  }

  buildContext(searchResults) {
    let context = ''
    let currentLength = 0

    for (const result of searchResults) {
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

    const engagement = upvotes > 0 ? `↑${upvotes} upvotes` : `${score} points`

    let content = ''
    if (result.type === 'post') {
      content = `POST TITLE: ${result.title}\nPOST CONTENT: ${result.content || '[No text content - possibly image/link post]'}`
    } else if (result.type === 'comment') {
      content = `COMMENT: ${result.content}`
    } else {
      content = `CONTENT: ${result.content}`
    }

    return `[${sourceType}] ${subreddit} | ${author} | ${engagement}
${content}
---`
  }
  async generateAIResponse(query, context, conversationHistory, isFallback = false) {
    const systemPrompt = isFallback
      ? `You are a student assistant analyzing Reddit discussions. Limited results found - be transparent about this.

Generate a clean, structured response in HTML format. Follow this EXACT structure:

<div class="reddit-response">
<p><em>Based on broader search results (limited direct matches found):</em></p>

<h3> Key Insights</h3>
<ul>
<li>Main point from <span style="color: #0066cc; font-weight: 500;">u/username</span> <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span></li>
<li>Another insight with proper source attribution</li>
</ul>

<h3> Community Feedback</h3>
<p>Brief summary of student opinions and experiences.</p>

<p><strong> Suggestion:</strong> Try more specific search terms for better results.</p>
</div>

CRITICAL RULES:
- Output ONLY HTML - no markdown, no code blocks, no backticks
- Use the exact structure shown above
- Always include username and upvote count for credibility
- Keep paragraphs short (1-2 sentences max)
- Use proper HTML tags, NOT markdown

Context: ${context}`
      : `You are a student assistant analyzing Reddit discussions about student life.

Generate a clean, well-structured response in HTML format. Follow this EXACT structure:

<div class="reddit-response">
<h3>Overview</h3>
<p>Direct answer to the question in 1-2 sentences.</p>

<h3>Student Experiences</h3>
<ul>
<li>Key point from <span style="color: #0066cc; font-weight: 500;">u/username</span> <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span></li>
<li>Another experience with source attribution</li>
<li>Different perspective if available</li>
</ul>

<h3>Important Details</h3>
<ul>
<li>Specific information students should know</li>
<li>Practical advice or warnings</li>
</ul>

<h3>Bottom Line</h3>
<p>Concise summary and practical takeaway for students.</p>
</div>

CRITICAL RULES:
- Output ONLY HTML - no markdown, no code blocks, no backticks  
- Use the exact structure shown above
- Always cite sources: <span style="color: #0066cc; font-weight: 500;">u/username</span> <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span>
- Keep all text concise and mobile-friendly
- Use proper HTML tags, NOT markdown
- Try to not omit anything important from the context
- Do not hallucinate usernames or upvote counts, if you do not have them, don't include them
- When you're talking about posts, don't just say stuff like "the first post says this" and all that, use the actual content of the post, but keep it elaborated and concise

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
        maxTokens: 3000,
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
      created: result.created_utc,
    }))
  }
  calculateConfidence(searchResults) {
    if (searchResults.length === 0) return 0


    logger.info(`Calculating confidence for ${searchResults.length} results`)

    const validResults = searchResults.filter(
      r => r.similarity !== undefined && r.similarity !== null
    )

    if (validResults.length === 0) {
      logger.warn('No results with valid similarity scores, using baseline confidence')
      const baselineConfidence = Math.min(50, 20 + searchResults.length * 5) // 20-50% based on result count
      logger.info(`Baseline confidence: ${baselineConfidence}%`)
      return baselineConfidence
    }

    const similarities = validResults.map(r => parseFloat(r.similarity) || 0)
    const scores = validResults.map(r => parseInt(r.score) || 0)

    const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length
    const resultsCount = Math.min(validResults.length, 10) / 10

    logger.info(
      `Avg similarity: ${avgSimilarity}, Avg score: ${avgScore}, Results count factor: ${resultsCount}`
    )

    const normalizedSimilarity = Math.max(0, Math.min(1, avgSimilarity))

    const confidence =
      normalizedSimilarity * 0.5 + Math.min(avgScore / 10, 1) * 0.3 + resultsCount * 0.2

    const finalConfidence = Math.round(Math.max(15, Math.min(100, confidence * 100)))
    logger.info(`Final confidence: ${finalConfidence}%`)

    return finalConfidence
  }

  async getRecommendations(query, limit = 5) {
    try {
      const searchResults = await this.knowledgeBase.search(query, limit * 2)

      const recommendations = searchResults
        .filter(result => result.similarity > 0.7)
        .slice(0, limit)
        .map(result => ({
          title: result.title,
          subreddit: result.subreddit,
          type: result.type,
          score: result.score,
          url: result.url,
          snippet: this.generateSnippet(result.content),
          relevance: result.similarity,
        }))

      return recommendations
    } catch (error) {
      logger.error('Error getting recommendations:', error)
      return []
    }
  }

  generateSnippet(content, maxLength = 200) {
    if (!content) return ''

    if (content.length <= maxLength) {
      return content
    }

    const sentences = content.split('. ')
    let snippet = ''

    for (const sentence of sentences) {
      if (snippet.length + sentence.length + 2 <= maxLength) {
        snippet += (snippet ? '. ' : '') + sentence
      } else {
        break
      }
    }

    return snippet + (snippet.length < content.length ? '...' : '')
  }
}

module.exports = RAGService
