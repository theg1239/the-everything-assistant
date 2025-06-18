const express = require('express')
const cors = require('cors')
const RAGService = require('./knowledge-base/rag-service')
const AgenticRAGService = require('./knowledge-base/agentic-rag-service')
const KnowledgeBase = require('./knowledge-base/knowledge-base')
const logger = require('./utils/logger')

const app = express()
const port = process.env.PORT || 3002

app.use(cors())
app.use(express.json())

const ragService = new AgenticRAGService()
const legacyRagService = new RAGService()
const knowledgeBase = new KnowledgeBase()

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'reddit-knowledge-api' })
})

app.post('/api/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    logger.info(`Search request: "${query}"`)

    const searchResults = await knowledgeBase.search(query, limit)

    res.json({
      success: true,
      results: searchResults.map(result => ({
        type: result.type,
        title: result.title,
        content: result.content?.substring(0, 300) + (result.content?.length > 300 ? '...' : ''),
        subreddit: result.subreddit,
        author: result.author,
        score: result.score,
        upvotes: result.upvotes,
        similarity: result.similarity,
        url: result.url,
        created: result.created_utc,
      })),
      totalResults: searchResults.length,
      query: query,
    })
  } catch (error) {
    logger.error('Search API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during search',
      message: error.message,
    })
  }
})

app.post('/api/ask', async (req, res) => {
  try {
    const { query, conversationHistory = [], useAgentic = true } = req.body

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    logger.info(`RAG request: "${query}" (agentic: ${useAgentic})`)

    const activeRagService = useAgentic ? ragService : legacyRagService
    const response = await activeRagService.generateResponse(query, conversationHistory)

    res.json({
      success: true,
      response: response.response,
      sources: response.sources,
      confidence: response.confidence,
      searchResults: response.searchResults,
      searchAttempts: response.searchAttempts,
      refinedQueries: response.refinedQueries,
      note: response.note,
      serviceUsed: useAgentic ? 'agentic' : 'legacy',
      query: query,
    })
  } catch (error) {
    logger.error('RAG API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during response generation',
      message: error.message,
    })
  }
})

app.get('/api/stats', async (req, res) => {
  try {
    const postCountResult = await knowledgeBase.pool.query('SELECT COUNT(*) FROM reddit_posts')
    const commentCountResult = await knowledgeBase.pool.query(
      'SELECT COUNT(*) FROM reddit_comments'
    )
    const embeddingCountResult = await knowledgeBase.pool.query(
      'SELECT COUNT(*) FROM reddit_posts WHERE embedding IS NOT NULL'
    )

    const subredditStats = await knowledgeBase.pool.query(`
      SELECT subreddit, COUNT(*) as post_count 
      FROM reddit_posts 
      GROUP BY subreddit 
      ORDER BY post_count DESC
    `)

    res.json({
      success: true,
      stats: {
        totalPosts: parseInt(postCountResult.rows[0].count),
        totalComments: parseInt(commentCountResult.rows[0].count),
        postsWithEmbeddings: parseInt(embeddingCountResult.rows[0].count),
        subreddits: subredditStats.rows,
      },
    })
  } catch (error) {
    logger.error('Stats API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching stats',
    })
  }
})

app.get('/api/trending', async (req, res) => {
  try {
    const trendingResult = await knowledgeBase.pool.query(`
      SELECT title, score, upvotes, subreddit, created_utc, url
      FROM reddit_posts 
      WHERE created_utc > NOW() - INTERVAL '30 days'
      ORDER BY score DESC 
      LIMIT 10
    `)

    res.json({
      success: true,
      trending: trendingResult.rows,
    })
  } catch (error) {
    logger.error('Trending API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching trending topics',
    })
  }
})

app.post('/api/compare', async (req, res) => {
  try {
    const { query, conversationHistory = [] } = req.body

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    logger.info(`Comparison request: "${query}"`)

    const [agenticResponse, legacyResponse] = await Promise.allSettled([
      ragService.generateResponse(query, conversationHistory),
      legacyRagService.generateResponse(query, conversationHistory),
    ])

    res.json({
      success: true,
      agentic: {
        status: agenticResponse.status,
        result: agenticResponse.status === 'fulfilled' ? agenticResponse.value : null,
        error: agenticResponse.status === 'rejected' ? agenticResponse.reason.message : null,
      },
      legacy: {
        status: legacyResponse.status,
        result: legacyResponse.status === 'fulfilled' ? legacyResponse.value : null,
        error: legacyResponse.status === 'rejected' ? legacyResponse.reason.message : null,
      },
      query: query,
    })
  } catch (error) {
    logger.error('Comparison API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during comparison',
      message: error.message,
    })
  }
})

app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  })
})

app.listen(port, () => {
  logger.info(`Knowledge API server running on port ${port}`)
  logger.info('Available endpoints:')
  logger.info('  GET  /health - Health check')
  logger.info('  POST /api/search - Search knowledge base')
  logger.info('  POST /api/ask - RAG-powered Q&A')
  logger.info('  GET  /api/stats - Database statistics')
  logger.info('  GET  /api/trending - Trending topics')
  logger.info('  POST /api/compare - Compare agentic vs legacy RAG')
})

module.exports = app
