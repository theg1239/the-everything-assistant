const express = require('express')
const cors = require('cors')
const RAGService = require('./knowledge-base/rag-service')
const AgenticRAGService = require('./knowledge-base/agentic-rag-service')
const KnowledgeBase = require('./knowledge-base/knowledge-base')

const app = express()

app.use(cors())
app.use(express.json())

// Log every incoming request and its payload
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`)
  next()
})

// Intercept res.json to log every response payload
app.use((req, res, next) => {
  const oldJson = res.json
  res.json = function (data) {
    console.log(`[Response] ${req.method} ${req.url} - Response: ${JSON.stringify(data)}`)
    return oldJson.call(this, data)
  }
  next()
})

const ragService = new AgenticRAGService()
const legacyRagService = new RAGService()
const knowledgeBase = new KnowledgeBase()

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'reddit-knowledge-api' })
})

app.post('/api/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    console.log(`Search request: "${query}"`)
    const searchResults = await knowledgeBase.search(query, limit)

    res.json({
      success: true,
      results: searchResults.map(r => ({
        type: r.type,
        title: r.title,
        content: r.content?.substring(0, 300) + (r.content?.length > 300 ? '...' : ''),
        subreddit: r.subreddit,
        author: r.author,
        score: r.score,
        upvotes: r.upvotes,
        similarity: r.similarity,
        url: r.url,
        created: r.created_utc,
        is_video: r.is_video,
        post_type: r.post_type,
        video: r.video
          ? {
              url: r.video.url,
              analysis: r.video.analysis
                ? {
                    description: r.video.analysis.description,
                    educational_content: r.video.analysis.educational_content,
                    student_relevance: r.video.analysis.student_relevance,
                    content_type: r.video.analysis.content_type,
                    summary: r.video.analysis.summary,
                    context_alignment: r.video.analysis.context_alignment,
                  }
                : null,
            }
          : null,
        images: r.images,
      })),
      totalResults: searchResults.length,
      query,
    })
  } catch (error) {
    console.error('Search API error:', error)
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
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    console.log(`RAG request: "${query}" (agentic: ${useAgentic})`)

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
    console.error('RAG API error:', error)
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
    const videoCountResult = await knowledgeBase.pool.query(
      'SELECT COUNT(*) FROM reddit_posts WHERE is_video = true'
    )
    const videoWithAnalysisResult = await knowledgeBase.pool.query(
      'SELECT COUNT(*) FROM reddit_posts WHERE is_video = true AND video IS NOT NULL'
    )
    const subredditStats = await knowledgeBase.pool.query(`
      SELECT subreddit, COUNT(*) AS post_count
      FROM reddit_posts
      GROUP BY subreddit
      ORDER BY post_count DESC
    `)

    res.json({
      success: true,
      stats: {
        totalPosts: parseInt(postCountResult.rows[0].count, 10),
        totalComments: parseInt(commentCountResult.rows[0].count, 10),
        postsWithEmbeddings: parseInt(embeddingCountResult.rows[0].count, 10),
        totalVideos: parseInt(videoCountResult.rows[0].count, 10),
        videosWithAnalysis: parseInt(videoWithAnalysisResult.rows[0].count, 10),
        subreddits: subredditStats.rows,
      },
    })
  } catch (error) {
    console.error('Stats API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching stats',
    })
  }
})

app.get('/api/trending', async (req, res) => {
  try {
    const trending = await knowledgeBase.pool.query(`
      SELECT title, score, upvotes, subreddit, created_utc, url
      FROM reddit_posts
      WHERE created_utc > NOW() - INTERVAL '30 days'
      ORDER BY score DESC
      LIMIT 10
    `)

    res.json({ success: true, trending: trending.rows })
  } catch (error) {
    console.error('Trending API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching trending topics',
    })
  }
})

app.post('/api/compare', async (req, res) => {
  try {
    const { query, conversationHistory = [] } = req.body
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    console.log(`Comparison request: "${query}"`)

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
    console.error('Comparison API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during comparison',
      message: error.message,
    })
  }
})

app.post('/api/search/videos', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a non-empty string',
      })
    }

    console.log(`Video search request: "${query}"`)

    const videosQuery = `
      SELECT 
        'post' AS type, reddit_id, subreddit, title, content, author,
        score, upvotes, created_utc, url, tags, is_video, post_type, 
        images, video,
        1 - (embedding <=> $1) AS similarity
      FROM reddit_posts 
      WHERE is_video = true 
        AND video IS NOT NULL 
        AND embedding IS NOT NULL
        AND embedding <=> $1 < $2
      ORDER BY similarity DESC, score DESC
      LIMIT $3
    `

    const queryEmbedding = await knowledgeBase.generateEmbedding(query)
    const result = await knowledgeBase.pool.query(videosQuery, [
      `[${queryEmbedding.join(',')}]`,
      1 - knowledgeBase.similarityThreshold,
      limit,
    ])

    res.json({
      success: true,
      results: result.rows.map(r => ({
        type: r.type,
        title: r.title,
        content: r.content?.substring(0, 300) + (r.content?.length > 300 ? '...' : ''),
        subreddit: r.subreddit,
        author: r.author,
        score: r.score,
        upvotes: r.upvotes,
        similarity: parseFloat(r.similarity.toFixed(3)),
        url: r.url,
        created: r.created_utc,
        is_video: r.is_video,
        post_type: r.post_type,
        video: r.video
          ? {
              url: r.video.url,
              poster: r.video.poster,
              analysis: r.video.analysis
                ? {
                    description: r.video.analysis.description,
                    educational_content: r.video.analysis.educational_content,
                    visible_text: r.video.analysis.visible_text,
                    key_topics: r.video.analysis.key_topics,
                    student_relevance: r.video.analysis.student_relevance,
                    content_type: r.video.analysis.content_type,
                    summary: r.video.analysis.summary,
                    context_alignment: r.video.analysis.context_alignment,
                    frames_analyzed: r.video.analysis.frames_analyzed,
                  }
                : null,
            }
          : null,
      })),
      totalResults: result.rows.length,
      query,
    })
  } catch (error) {
    console.error('Video search API error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during video search',
      message: error.message,
    })
  }
})

app.use((err, req, res, next) => {
  console.error('Unhandled error in RAG API:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  })
})

// Uncomment and configure your port when ready to run
// const port = process.env.PORT || 3002
// app.listen(port, () => {
//   console.log(`Knowledge API server running on port ${port}`)
//   console.log('Available endpoints:')
//   console.log('  GET  /health')
//   console.log('  POST /api/search')
//   console.log('  POST /api/ask')
//   console.log('  GET  /api/stats')
//   console.log('  GET  /api/trending')
//   console.log('  POST /api/compare')
// })

module.exports = app
