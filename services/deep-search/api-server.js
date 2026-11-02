const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const RAGService = require('./knowledge-base/rag-service')
const AgenticRAGService = require('./knowledge-base/agentic-rag-service')
const KnowledgeBase = require('./knowledge-base/knowledge-base')

// --- Access control -------------------------------------------------------------------------
// Every /api/* route requires `Authorization: Bearer <DEEP_SEARCH_API_SECRET>`; /health stays
// public. Without the secret the service refuses to start, unless DEEP_SEARCH_INSECURE_DEV=1 is set
// outside production.
const apiSecret = (process.env.DEEP_SEARCH_API_SECRET || '').trim()
const insecureDev =
  process.env.DEEP_SEARCH_INSECURE_DEV === '1' && process.env.NODE_ENV !== 'production'

if (!apiSecret && !insecureDev) {
  throw new Error(
    'DEEP_SEARCH_API_SECRET is not set. Refusing to start the deep-search API: /api/* would be ' +
      'open to anyone. Set DEEP_SEARCH_API_SECRET (e.g. `openssl rand -hex 32`) and send it as ' +
      '`Authorization: Bearer <secret>`, or for local development only set ' +
      'DEEP_SEARCH_INSECURE_DEV=1 with NODE_ENV != production.'
  )
}
if (!apiSecret) {
  console.warn('DEEP_SEARCH_INSECURE_DEV=1: deep-search /api/* routes are NOT authenticated')
}

const sha256 = value => crypto.createHash('sha256').update(value, 'utf8').digest()

/** Constant-time comparison; hashing first gives equal-length buffers whatever the input lengths. */
const secretsMatch = (expected, provided) =>
  Boolean(expected && provided) && crypto.timingSafeEqual(sha256(expected), sha256(provided))

const requireApiSecret = (req, res, next) => {
  if (!apiSecret) return next()
  const match = /^Bearer\s+(.+)$/iu.exec((req.get('authorization') || '').trim())
  if (match && secretsMatch(apiSecret, match[1].trim())) return next()
  res.setHeader('WWW-Authenticate', 'Bearer')
  return res.status(401).json({ success: false, error: 'Unauthorized' })
}

// Browser access only from explicitly configured origins (comma-separated); none by default, since
// the main app calls this service server-side.
const allowedOrigins = (process.env.DEEP_SEARCH_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

const app = express()

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : false }))
app.use('/api', requireApiSecret)
app.use(express.json())

app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`)
  next()
})

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
    // Independent reads: run them together, and count the four post figures in one table scan.
    const [postCountsResult, commentCountResult, subredditStats] = await Promise.all([
      knowledgeBase.pool.query(`
        SELECT
          COUNT(*) AS total_posts,
          COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS posts_with_embeddings,
          COUNT(*) FILTER (WHERE is_video = true) AS total_videos,
          COUNT(*) FILTER (WHERE is_video = true AND video IS NOT NULL) AS videos_with_analysis
        FROM reddit_posts
      `),
      knowledgeBase.pool.query('SELECT COUNT(*) FROM reddit_comments'),
      knowledgeBase.pool.query(`
        SELECT subreddit, COUNT(*) AS post_count
        FROM reddit_posts
        GROUP BY subreddit
        ORDER BY post_count DESC
      `),
    ])
    const postCounts = postCountsResult.rows[0]

    res.json({
      success: true,
      stats: {
        totalPosts: parseInt(postCounts.total_posts, 10),
        totalComments: parseInt(commentCountResult.rows[0].count, 10),
        postsWithEmbeddings: parseInt(postCounts.posts_with_embeddings, 10),
        totalVideos: parseInt(postCounts.total_videos, 10),
        videosWithAnalysis: parseInt(postCounts.videos_with_analysis, 10),
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


module.exports = app
