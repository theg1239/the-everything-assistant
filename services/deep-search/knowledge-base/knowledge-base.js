require('dotenv').config()

const { Pool } = require('pg')
const { embed } = require('ai')
const { createOpenAI, openai } = require('@ai-sdk/openai')
const { google } = require('@ai-sdk/google')
const logger = require('../utils/logger')

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function resolveEmbeddingConfig() {
  const providerRaw =
    process.env.DEEP_SEARCH_EMBEDDING_PROVIDER ||
    process.env.RAG_EMBEDDING_PROVIDER ||
    process.env.EMBEDDING_MODEL_PROVIDER ||
    'openai'
  const modelRaw =
    process.env.DEEP_SEARCH_EMBEDDING_MODEL ||
    process.env.RAG_EMBEDDING_MODEL ||
    process.env.EMBEDDING_MODEL ||
    ''
  const dim = parsePositiveInt(
    process.env.DEEP_SEARCH_EMBEDDING_DIM ||
      process.env.RAG_EMBEDDING_DIM ||
      process.env.EMBEDDING_DIM,
    768
  )

  let provider = providerRaw.toLowerCase().trim()
  let modelId = modelRaw.trim()

  const modelPrefixMatch = modelId.match(/^(openai|google)\/(.+)$/i)
  if (modelPrefixMatch) {
    provider = modelPrefixMatch[1].toLowerCase()
    modelId = modelPrefixMatch[2]
  } else if (provider === 'direct') {
    provider = 'google'
  }

  if (provider !== 'openai' && provider !== 'google') {
    logger.warn(`Unsupported embedding provider "${providerRaw}", falling back to "openai"`)
    provider = 'openai'
  }

  if (!modelId) {
    modelId = provider === 'google' ? 'text-embedding-004' : 'text-embedding-3-large'
  }

  const openaiBaseURL =
    process.env.DEEP_SEARCH_OPENAI_BASE_URL ||
    process.env.RAG_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'

  return { provider, modelId, dim, openaiBaseURL }
}

class KnowledgeBase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
    const embeddingConfig = resolveEmbeddingConfig()
    this.embeddingProvider = embeddingConfig.provider
    this.embeddingModelId = embeddingConfig.modelId
    this.embeddingDim = embeddingConfig.dim
    this.openaiBaseURL = embeddingConfig.openaiBaseURL
    this.openaiProvider =
      this.embeddingProvider === 'openai'
        ? createOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: this.openaiBaseURL,
          })
        : null
    this.embeddingModel = this.createEmbeddingModel()
    this.embeddingProviderOptions =
      this.embeddingProvider === 'openai'
        ? {
            openai: {
              dimensions: this.embeddingDim,
            },
          }
        : undefined
    this.similarityThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.5
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 4000

    if (this.embeddingProvider === 'openai' && !process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required for OpenAI embeddings')
    }

    if (this.embeddingProvider === 'google' && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY environment variable is required for Google embeddings'
      )
    }

    logger.info(
      `Embedding config: provider=${this.embeddingProvider}, model=${this.embeddingModelId}, dim=${this.embeddingDim}, openaiBaseURL=${this.embeddingProvider === 'openai' ? this.openaiBaseURL : 'n/a'}`
    )
  }

  createEmbeddingModel(legacyOpenAiSettings = false) {
    if (this.embeddingProvider === 'google') {
      return google.textEmbeddingModel(this.embeddingModelId)
    }

    if (legacyOpenAiSettings) {
      // Backwards-compatible with older OpenAI provider API shapes where embedding settings
      // are passed at model-construction time instead of request-time provider options.
      const provider = this.openaiProvider || openai
      return provider.embedding(this.embeddingModelId, {
        dimensions: this.embeddingDim,
      })
    }

    const provider = this.openaiProvider || openai
    return provider.embedding(this.embeddingModelId)
  }

  async initialize() {
    try {
      await this.createTables()
      await this.migrateVectorDimensions()
      await this.migrateVideoColumn() // Add video column migration
      await this.createIndexes()
      logger.info('Knowledge base initialized successfully')
    } catch (error) {
      logger.error('Error initializing knowledge base:', error)
      throw error
    }
  }

  async migrateVideoColumn() {
    try {
      const checkVideoColumnSQL = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'reddit_posts' 
          AND column_name = 'video'
      `

      const result = await this.pool.query(checkVideoColumnSQL)

      if (result.rows.length === 0) {
        logger.info('Adding video column to reddit_posts table...')
        const addVideoColumnSQL = `
          ALTER TABLE reddit_posts 
          ADD COLUMN video JSONB;
        `
        await this.pool.query(addVideoColumnSQL)
        logger.info('Video column migration completed successfully')
      }
    } catch (error) {
      logger.error('Error during video column migration:', error)
    }
  }

  async migrateVectorDimensions() {
    try {
      const columns = [
        { tableName: 'reddit_posts', attrelid: "'reddit_posts'::regclass" },
        { tableName: 'reddit_comments', attrelid: "'reddit_comments'::regclass" },
        { tableName: 'knowledge_chunks', attrelid: "'knowledge_chunks'::regclass" },
      ]

      for (const column of columns) {
        const result = await this.pool.query(
          `
          SELECT pg_catalog.format_type(atttypid, atttypmod) AS embedding_type
          FROM pg_attribute
          WHERE attrelid = ${column.attrelid}
            AND attname = 'embedding'
            AND attnum > 0
            AND NOT attisdropped
          `
        )

        const embeddingType = result.rows[0]?.embedding_type
        if (!embeddingType) continue

        const match = embeddingType.match(/vector\((\d+)\)/i)
        const existingDim = match ? Number.parseInt(match[1], 10) : null

        if (existingDim && existingDim !== this.embeddingDim) {
          logger.warn(
            `Embedding dimension mismatch on ${column.tableName}.embedding: found ${existingDim}, configured ${this.embeddingDim}. ` +
              'Skipping automatic migration to preserve existing vectors.'
          )
        }
      }
    } catch (error) {
      logger.error('Error during vector dimension migration:', error)
    }
  }

  async createTables() {
    const createTablesSQL = `
      -- Enable pgvector extension
      CREATE EXTENSION IF NOT EXISTS vector;
      
      -- Posts table
      CREATE TABLE IF NOT EXISTS reddit_posts (
        id SERIAL PRIMARY KEY,
        reddit_id VARCHAR(50) UNIQUE NOT NULL,
        subreddit VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        author VARCHAR(100),
        created_utc TIMESTAMP NOT NULL,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        num_comments INTEGER DEFAULT 0,
        url TEXT,
        permalink TEXT,
        is_video BOOLEAN DEFAULT FALSE,
        post_type VARCHAR(20),
        images JSONB,
        video JSONB, -- Store video data and analysis
        extracted_text TEXT,
        tags TEXT[],
        embedding vector(${this.embeddingDim}),
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Comments table
      CREATE TABLE IF NOT EXISTS reddit_comments (
        id SERIAL PRIMARY KEY,
        reddit_id VARCHAR(50) UNIQUE NOT NULL,
        post_reddit_id VARCHAR(50) NOT NULL,
        parent_comment_id VARCHAR(50),
        subreddit VARCHAR(100) NOT NULL,
        author VARCHAR(100),
        content TEXT NOT NULL,
        created_utc TIMESTAMP NOT NULL,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        depth INTEGER DEFAULT 0,
        is_submitter BOOLEAN DEFAULT FALSE,        tags TEXT[],
        embedding vector(${this.embeddingDim}),
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Knowledge chunks table (for RAG)
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id SERIAL PRIMARY KEY,
        source_type VARCHAR(20) NOT NULL, -- 'post' or 'comment'
        source_id INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        subreddit VARCHAR(100) NOT NULL,        relevance_score FLOAT DEFAULT 0,
        embedding vector(${this.embeddingDim}),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Subreddit statistics
      CREATE TABLE IF NOT EXISTS subreddit_stats (
        id SERIAL PRIMARY KEY,
        subreddit VARCHAR(100) UNIQUE NOT NULL,
        total_posts INTEGER DEFAULT 0,
        total_comments INTEGER DEFAULT 0,
        avg_score FLOAT DEFAULT 0,
        last_scraped TIMESTAMP,
        active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Search queries log
      CREATE TABLE IF NOT EXISTS search_queries (
        id SERIAL PRIMARY KEY,
        query TEXT NOT NULL,
        results_count INTEGER,
        response_time_ms INTEGER,
        user_ip VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
    await this.pool.query(createTablesSQL)
  }
  async createIndexes() {
    const versionResult = await this.pool.query('SELECT version() AS version')
    const databaseVersion = versionResult.rows[0]?.version || ''
    const isCockroach = /cockroachdb/i.test(databaseVersion)
    const methodsToTry = isCockroach ? ['hnsw', 'ivfflat'] : ['ivfflat', 'hnsw']

    for (const method of methodsToTry) {
      const indexesSQL = `
        CREATE INDEX IF NOT EXISTS idx_posts_embedding
          ON reddit_posts USING ${method} (embedding vector_cosine_ops);
        CREATE INDEX IF NOT EXISTS idx_comments_embedding
          ON reddit_comments USING ${method} (embedding vector_cosine_ops);
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding
          ON knowledge_chunks USING ${method} (embedding vector_cosine_ops);
      `

      try {
        await this.pool.query(indexesSQL)
        logger.info(`Vector indexes are ready using "${method}"`)
        return
      } catch (error) {
        if (this.isUnsupportedVectorIndexError(error, method)) {
          logger.warn(
            `Vector index method "${method}" is unavailable on this database; trying fallback...`
          )
          continue
        }

        throw error
      }
    }

    logger.warn(
      'No supported vector index access method was found. Continuing without vector indexes (vector search will be slower).'
    )
  }

  isUnsupportedVectorIndexError(error, method) {
    const message = (error?.message || '').toLowerCase()
    const detail = (error?.detail || '').toLowerCase()
    const combined = `${message} ${detail}`
    const methodName = method.toLowerCase()

    return (
      combined.includes('unrecognized access method') ||
      combined.includes(`access method "${methodName}" does not exist`) ||
      combined.includes('does not support access method') ||
      (combined.includes('syntax error') && combined.includes(`using ${methodName}`)) ||
      (combined.includes('operator class') &&
        combined.includes('vector_cosine_ops') &&
        combined.includes('does not exist'))
    )
  }

  async upsertRedditPost(post) {
    const {
      id: reddit_id,
      subreddit,
      title,
      selftext: content,
      author,
      created_utc,
      ups: upvotes = 0,
      downs: downvotes = 0,
      score = 0,
      num_comments = 0,
      url,
      permalink,
      is_video = false,
      preview,
      media = null,
    } = post

    const images = preview?.images?.map(img => img.source.url) || []
    const imagesJson = JSON.stringify(images)
    const videoJson = JSON.stringify(media)

    const insertSQL = `
      INSERT INTO reddit_posts
        (reddit_id, subreddit, title, content, author, created_utc, upvotes, downvotes, score, num_comments, url, permalink, is_video, images, video, extracted_text)
      VALUES
        ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (reddit_id) DO UPDATE SET
        content = EXCLUDED.content,
        upvotes = EXCLUDED.upvotes,
        downvotes = EXCLUDED.downvotes,
        score = EXCLUDED.score,
        num_comments = EXCLUDED.num_comments,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `
    const values = [
      reddit_id,
      subreddit,
      title,
      content,
      author,
      created_utc,
      upvotes,
      downvotes,
      score,
      num_comments,
      url,
      permalink,
      is_video,
      imagesJson,
      videoJson,
      `${title}\n\n${content}`,
    ]
    const res = await this.pool.query(insertSQL, values)
    return res.rows[0].id
  }

  async upsertRedditComment(comment) {
    const {
      id: reddit_id,
      link_id,
      parent_id,
      subreddit,
      body: content,
      author,
      created_utc,
      ups: upvotes = 0,
      downs: downvotes = 0,
      score = 0,
    } = comment

    const postRedditId = link_id.split('_')[1]
    const parentCommentId =
      parent_id && parent_id.startsWith('t1_') ? parent_id.split('_')[1] : null

    const insertSQL = `
      INSERT INTO reddit_comments
        (reddit_id, post_reddit_id, parent_comment_id, subreddit, author, content, created_utc, upvotes, downvotes, score)
      VALUES
        ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8, $9, $10)
      ON CONFLICT (reddit_id) DO UPDATE SET
        content = EXCLUDED.content,
        upvotes = EXCLUDED.upvotes,
        downvotes = EXCLUDED.downvotes,
        score = EXCLUDED.score
      RETURNING id;
    `
    const values = [
      reddit_id,
      postRedditId,
      parentCommentId,
      subreddit,
      author,
      content,
      created_utc,
      upvotes,
      downvotes,
      score,
    ]
    const res = await this.pool.query(insertSQL, values)
    return res.rows[0].id
  }

  async storePost(postData) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const textContent = `${postData.title} ${postData.content} ${postData.extracted_text}`.trim()
      const embedding = await this.generateEmbedding(textContent, 'RETRIEVAL_DOCUMENT')

      if (!embedding) {
        logger.warn(`Skipping embedding for post ${postData.reddit_id}; text search fallback only`)
      } else {
        logger.debug(
          `Generated embedding with ${embedding.length} dimensions for post ${postData.reddit_id}`
        )
      }

      const insertPostSQL = `
        INSERT INTO reddit_posts (
          reddit_id, subreddit, title, content, author, created_utc,
          upvotes, downvotes, score, num_comments, url, permalink,
          is_video, post_type, images, video, extracted_text, tags, embedding
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19
        )
        ON CONFLICT (reddit_id) DO UPDATE SET
          title       = EXCLUDED.title,
          content     = EXCLUDED.content,
          author      = EXCLUDED.author,
          created_utc = EXCLUDED.created_utc,
          url         = EXCLUDED.url,
          permalink   = EXCLUDED.permalink,
          is_video    = EXCLUDED.is_video,
          post_type   = EXCLUDED.post_type,
          images      = EXCLUDED.images,
          extracted_text = EXCLUDED.extracted_text,
          tags        = EXCLUDED.tags,
          upvotes     = EXCLUDED.upvotes,
          downvotes   = EXCLUDED.downvotes,
          score       = EXCLUDED.score,
          num_comments= EXCLUDED.num_comments,
          video       = EXCLUDED.video,
          embedding   = COALESCE(EXCLUDED.embedding, reddit_posts.embedding),
          updated_at  = CURRENT_TIMESTAMP
        RETURNING id
      `
      const result = await client.query(insertPostSQL, [
        postData.reddit_id,
        postData.subreddit,
        postData.title,
        postData.content,
        postData.author,
        postData.created_utc,
        postData.upvotes,
        postData.downvotes,
        postData.score,
        postData.num_comments,
        postData.url,
        postData.permalink,
        postData.is_video,
        postData.post_type,
        JSON.stringify(postData.images),
        JSON.stringify(postData.video || null), // Store video data as JSON
        postData.extracted_text,
        postData.tags,
        embedding ? `[${embedding.join(',')}]` : null,
      ])

      const postId = result.rows[0].id
      await this.createKnowledgeChunks(client, textContent, 'post', postId, postData.subreddit)
      await this.updateSubredditStats(client, postData.subreddit)

      await client.query('COMMIT')
      logger.info(`Stored post ${postData.reddit_id} in knowledge base`)
      return postId
    } catch (error) {
      await client.query('ROLLBACK')

      logger.error(`Error storing post ${postData.reddit_id}:`, error)
      throw error
    } finally {
      client.release()
    }
  }
  async storeComment(commentData) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      if (!commentData.reddit_id) {
        throw new Error('Comment reddit_id is required')
      }
      if (!commentData.content || !commentData.content.trim()) {
        throw new Error('Comment content is required')
      }

      const embedding = await this.generateEmbedding(commentData.content, 'RETRIEVAL_DOCUMENT')
      if (!embedding) {
        logger.warn(
          `Skipping embedding for comment ${commentData.reddit_id}; text search fallback only`
        )
      }

      const insertCommentSQL = `
        INSERT INTO reddit_comments (
          reddit_id, post_reddit_id, parent_comment_id, subreddit, author,
          content, created_utc, upvotes, downvotes, score, depth,
          is_submitter, tags, embedding
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14
        )
        ON CONFLICT (reddit_id) DO UPDATE SET
          post_reddit_id = EXCLUDED.post_reddit_id,
          parent_comment_id = EXCLUDED.parent_comment_id,
          author      = EXCLUDED.author,
          content     = EXCLUDED.content,
          created_utc = EXCLUDED.created_utc,
          upvotes     = EXCLUDED.upvotes,
          downvotes   = EXCLUDED.downvotes,
          score       = EXCLUDED.score,
          embedding   = COALESCE(EXCLUDED.embedding, reddit_comments.embedding)
        RETURNING id
      `
      const result = await client.query(insertCommentSQL, [
        commentData.reddit_id,
        commentData.post_reddit_id,
        commentData.parent_comment_id,
        commentData.subreddit,
        commentData.author,
        commentData.content,
        commentData.created_utc,
        commentData.upvotes,
        commentData.downvotes,
        commentData.score,
        commentData.depth,
        commentData.is_submitter,
        commentData.tags,
        embedding ? `[${embedding.join(',')}]` : null,
      ])

      const commentId = result.rows[0].id
      if (commentData.content.length > 200) {
        await this.createKnowledgeChunks(
          client,
          commentData.content,
          'comment',
          commentId,
          commentData.subreddit
        )
      }
      await client.query('COMMIT')
      return commentId
    } catch (error) {
      await client.query('ROLLBACK')

      if (error.message && error.message.includes('null value in column "reddit_id"')) {
        logger.error(`Comment reddit_id validation failed: ${JSON.stringify(commentData)}`)
        throw new Error(
          `Comment reddit_id cannot be null. Comment data: ${JSON.stringify(commentData)}`
        )
      }

      logger.error(`Error storing comment ${commentData.reddit_id || 'unknown'}:`, error)
      throw error
    } finally {
      client.release()
    }
  }

  async createKnowledgeChunks(client, text, sourceType, sourceId, subreddit) {
    if (!text || text.length < 100) return
    const chunks = this.splitTextIntoChunks(text)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = await this.generateEmbedding(chunk, 'RETRIEVAL_DOCUMENT')
      if (!embedding) continue

      const insertChunkSQL = `
        INSERT INTO knowledge_chunks (
          source_type, source_id, chunk_text, chunk_index, subreddit, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `
      await client.query(insertChunkSQL, [
        sourceType,
        sourceId,
        chunk,
        i,
        subreddit,
        `[${embedding.join(',')}]`,
        JSON.stringify({
          length: chunk.length,
          words: chunk.split(' ').length,
        }),
      ])
    }
  }

  splitTextIntoChunks(text, maxChunkSize = 500, overlap = 50) {
    const words = text.split(' ')
    const chunks = []
    for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
      const chunk = words.slice(i, i + maxChunkSize).join(' ')
      if (chunk.trim()) chunks.push(chunk.trim())
    }
    return chunks
  }

  async generateEmbedding(text) {
    if (!text || !text.trim()) {
      return null
    }
    try {
      const value = text.substring(0, this.maxContextLength)
      const embedOptions = {
        model: this.embeddingModel,
        value,
      }

      if (this.embeddingProviderOptions) {
        embedOptions.providerOptions = this.embeddingProviderOptions
      }

      let result = await embed(embedOptions)
      let embedding = result.embedding

      if (
        this.embeddingProvider === 'openai' &&
        Array.isArray(embedding) &&
        embedding.length !== this.embeddingDim
      ) {
        logger.warn(
          `Embedding mismatch on primary OpenAI path (got ${embedding.length}, expected ${this.embeddingDim}); retrying with model-level dimensions settings`
        )

        result = await embed({
          model: this.createEmbeddingModel(true),
          value,
        })
        embedding = result.embedding
      }

      if (!Array.isArray(embedding) || embedding.length !== this.embeddingDim) {
        logger.error(
          `Embedding dimension mismatch: got ${embedding?.length}, expected ${this.embeddingDim} (provider=${this.embeddingProvider}, model=${this.embeddingModelId})`
        )
        if (this.embeddingProvider === 'openai') {
          logger.error(
            `OpenAI embedding response headers hint: openai-model=${result?.response?.headers?.['openai-model'] || 'unknown'}, openai-processing-ms=${result?.response?.headers?.['openai-processing-ms'] || 'unknown'}, baseURL=${this.openaiBaseURL}`
          )
        }
        return null
      }
      if (this.isZeroEmbedding(embedding)) {
        logger.warn('Generated a zero embedding; skipping vector storage/search')
        return null
      }
      return embedding
    } catch (error) {
      logger.error('Error generating embedding:', error)
      return null
    }
  }
  async search(query, limit = 10) {
    const startTime = Date.now()

    try {
      const diverseResults = await this.diverseSearch(query, limit)

      if (diverseResults.length > 0) {
        const responseTime = Date.now() - startTime
        await this.logSearchQuery(query, diverseResults.length, responseTime)
        return diverseResults.slice(0, limit)
      }

      logger.info(`No diverse results found for "${query}", trying fallback vector search...`)
      const vectorResults = await this.vectorSearch(query, limit)

      if (vectorResults.length > 0) {
        const responseTime = Date.now() - startTime
        await this.logSearchQuery(query, vectorResults.length, responseTime)
        return vectorResults
      }

      logger.info(`No vector results found for "${query}", trying text search...`)
      const textResults = await this.textSearch(query, limit)

      const responseTime = Date.now() - startTime
      await this.logSearchQuery(query, textResults.length, responseTime)
      return textResults
    } catch (error) {
      logger.error('Error in search:', error)
      try {
        const textResults = await this.textSearch(query, limit)
        const responseTime = Date.now() - startTime
        await this.logSearchQuery(query, textResults.length, responseTime)
        return textResults
      } catch (textError) {
        logger.error('Text search also failed:', textError)
        return []
      }
    }
  }
  async vectorSearch(query, limit = 10) {
    const queryEmbedding = await this.generateEmbedding(query, 'RETRIEVAL_QUERY')
    if (!queryEmbedding) {
      logger.warn('Skipping vector search because query embedding is unavailable')
      return []
    }

    const postLimit = Math.ceil(limit * 0.5)
    const commentLimit = Math.ceil(limit * 0.4)
    const chunkLimit = Math.ceil(limit * 0.2)

    const searchSQL = `
      WITH post_results AS (
        SELECT
          'post' AS type,
          reddit_id, subreddit, title, content, author,
          score, upvotes, created_utc, url, tags,
          is_video, post_type, images, video,
          1 - (embedding <=> $1) AS similarity
        FROM reddit_posts
        WHERE embedding IS NOT NULL AND embedding <=> $1 < $2
        ORDER BY similarity DESC
        LIMIT $3
      ),
      comment_results AS (
        SELECT
          'comment' AS type,
          reddit_id, subreddit, content AS title, content,
          author, score, upvotes, created_utc, NULL AS url, tags,
          false AS is_video, 'comment' AS post_type, NULL AS images, NULL AS video,
          1 - (embedding <=> $1) AS similarity
        FROM reddit_comments
        WHERE embedding IS NOT NULL AND embedding <=> $1 < $2
        ORDER BY similarity DESC
        LIMIT $4
      ),
      chunk_results AS (
        SELECT
          'chunk' AS type,
          source_id::text AS reddit_id, subreddit,
          chunk_text AS title, chunk_text AS content,
          NULL AS author, relevance_score AS score,
          0 AS upvotes, created_at AS created_utc,
          NULL AS url, ARRAY[]::text[] AS tags,
          false AS is_video, 'chunk' AS post_type, NULL AS images, NULL AS video,
          1 - (embedding <=> $1) AS similarity
        FROM knowledge_chunks
        WHERE embedding IS NOT NULL AND embedding <=> $1 < $2
        ORDER BY similarity DESC
        LIMIT $5
      )
      SELECT * FROM (
        SELECT * FROM post_results
        UNION ALL
        SELECT * FROM comment_results
        UNION ALL
        SELECT * FROM chunk_results
      ) AS combined
      ORDER BY similarity DESC
      LIMIT $6
    `

    const result = await this.pool.query(searchSQL, [
      `[${queryEmbedding.join(',')}]`,
      1 - this.similarityThreshold,
      postLimit,
      commentLimit,
      chunkLimit,
      limit * 2,
    ])

    return result.rows.map(r => ({
      ...r,
      similarity: parseFloat(r.similarity.toFixed(3)),
    }))
  }

  async textSearch(query, limit = 10) {
    logger.info(`Performing text search for: "${query}"`)

    const searchTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .slice(0, 5)

    if (searchTerms.length === 0) {
      return []
    }

    const tsQuery = searchTerms.map(term => `'${term}':*`).join(' & ')

    const textSearchSQL = `
      WITH post_results AS (
        SELECT
          'post' AS type,
          reddit_id, subreddit, title, content, author,
          score, upvotes, created_utc, url, tags,
          is_video, post_type, images, video,
          ts_rank(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')), to_tsquery('english', $1)) AS similarity
        FROM reddit_posts
        WHERE to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')) @@ to_tsquery('english', $1)
        ORDER BY similarity DESC, score DESC
        LIMIT $2
      ),
      comment_results AS (
        SELECT
          'comment' AS type,
          reddit_id, subreddit, LEFT(content, 100) AS title, content,
          author, score, upvotes, created_utc, NULL AS url, tags,
          false AS is_video, 'comment' AS post_type, NULL AS images, NULL AS video,
          ts_rank(to_tsvector('english', content), to_tsquery('english', $1)) AS similarity
        FROM reddit_comments
        WHERE to_tsvector('english', content) @@ to_tsquery('english', $1)
        ORDER BY similarity DESC, score DESC
        LIMIT $2
      )
      SELECT * FROM (
        SELECT * FROM post_results
        UNION ALL
        SELECT * FROM comment_results
      ) AS combined
      ORDER BY similarity DESC, score DESC
      LIMIT $2
    `

    try {
      const result = await this.pool.query(textSearchSQL, [tsQuery, limit])
      return result.rows.map(r => ({
        ...r,
        similarity: parseFloat(r.similarity.toFixed(3)),
      }))
    } catch (error) {
      logger.error('Text search failed, trying simpler search:', error.message)

      const simpleSearchSQL = `
        SELECT
          'post' AS type,
          reddit_id, subreddit, title, content, author,
          score, upvotes, created_utc, url, tags,
          is_video, post_type, images, video,
          0.5 AS similarity
        FROM reddit_posts
        WHERE title ILIKE $1 OR content ILIKE $1
        UNION ALL
        SELECT
          'comment' AS type,
          reddit_id, subreddit, LEFT(content, 100) AS title, content,
          author, score, upvotes, created_utc, NULL AS url, tags,
          false AS is_video, 'comment' AS post_type, NULL AS images, NULL AS video,
          0.4 AS similarity
        FROM reddit_comments
        WHERE content ILIKE $1
        ORDER BY similarity DESC, score DESC
        LIMIT $2
      `

      const searchPattern = `%${query}%`
      const result = await this.pool.query(simpleSearchSQL, [searchPattern, limit])
      return result.rows
    }
  }

  async logSearchQuery(query, resultsCount, responseTimeMs, userIp = null) {
    try {
      const logSQL = `
        INSERT INTO search_queries (
          query, results_count, response_time_ms, user_ip
        ) VALUES ($1, $2, $3, $4)
      `
      await this.pool.query(logSQL, [query, resultsCount, responseTimeMs, userIp])
    } catch (error) {
      logger.error('Error logging search query:', error)
    }
  }

  async getPostByRedditId(redditId) {
    const res = await this.pool.query('SELECT * FROM reddit_posts WHERE reddit_id = $1', [redditId])
    return res.rows[0]
  }

  async updatePostStats(redditId, stats) {
    const updateSQL = `
      UPDATE reddit_posts
      SET upvotes    = $2,
          downvotes  = $3,
          score      = $4,
          num_comments = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE reddit_id = $1
    `
    await this.pool.query(updateSQL, [
      redditId,
      stats.upvotes,
      stats.downvotes,
      stats.score,
      stats.num_comments,
    ])
  }

  async updateSubredditStats(client, subreddit) {
    const statsSQL = `
      INSERT INTO subreddit_stats (
        subreddit, total_posts, total_comments, avg_score, last_scraped
      )
      SELECT
        $1,
        COUNT(DISTINCT p.id),
        COUNT(DISTINCT c.id),
        AVG(p.score),
        CURRENT_TIMESTAMP
      FROM reddit_posts p
      LEFT JOIN reddit_comments c
        ON c.post_reddit_id = p.reddit_id
      WHERE p.subreddit = $2
      ON CONFLICT (subreddit) DO UPDATE SET
        total_posts    = EXCLUDED.total_posts,
        total_comments = EXCLUDED.total_comments,
        avg_score      = EXCLUDED.avg_score,
        last_scraped   = EXCLUDED.last_scraped,
        updated_at     = CURRENT_TIMESTAMP
    `
    await client.query(statsSQL, [subreddit, subreddit])
  }

  async getStatistics() {
    const statsSQL = `
      SELECT
        COUNT(DISTINCT subreddit) AS total_subreddits,
        COUNT(*)                  AS total_posts,
        (SELECT COUNT(*) FROM reddit_comments)  AS total_comments,
        (SELECT COUNT(*) FROM knowledge_chunks) AS total_chunks,
        AVG(score)                AS avg_post_score,
        MAX(created_utc)          AS latest_post
      FROM reddit_posts
    `
    const res = await this.pool.query(statsSQL)
    return res.rows[0]
  }

  async getSubredditStats() {
    const res = await this.pool.query(`
      SELECT *
      FROM subreddit_stats
      WHERE active = true
      ORDER BY total_posts DESC
    `)
    return res.rows
  }

  async getTopPosts(subreddit = null, limit = 10) {
    let sql = `
      SELECT reddit_id, subreddit, title, score, upvotes, num_comments, created_utc
      FROM reddit_posts
    `
    const params = []
    if (subreddit) {
      sql += ' WHERE subreddit = $1'
      params.push(subreddit)
    }
    sql += ` ORDER BY score DESC LIMIT $${params.length + 1}`
    params.push(limit)

    const res = await this.pool.query(sql, params)
    return res.rows
  }

  async cleanup() {
    await this.pool.end()
  }
  async diverseSearch(query, limit = 10) {
    try {
      const strategies = [
        { name: 'vector', fn: () => this.vectorSearch(query, limit) },
        { name: 'text', fn: () => this.textSearch(query, limit) },
        { name: 'keywords', fn: () => this.searchByKeywords(query, limit) },
      ]

      let allResults = []

      for (const strategy of strategies) {
        try {
          logger.info(`Trying ${strategy.name} search strategy...`)
          const results = await strategy.fn()
          if (results && results.length > 0) {
            logger.info(`${strategy.name} search found ${results.length} results`)
            allResults = allResults.concat(
              results.map(result => ({
                ...result,
                sourceStrategy: strategy.name,
              }))
            )
          }
        } catch (error) {
          logger.warn(`${strategy.name} search strategy failed:`, error.message)
        }
      }

      if (allResults.length === 0) {
        logger.info('No results from any search strategy')
        return []
      }

      const uniqueResults = this.removeDuplicates(allResults)
      logger.info(`After deduplication: ${uniqueResults.length} unique results`)

      const queryTerms = this.extractSearchTerms(query)

      return uniqueResults
        .map(result => ({
          ...result,
          rankingScore: this.scoreSearchResult(result, queryTerms),
        }))
        .sort((a, b) => {
          const rankingDelta = (b.rankingScore || 0) - (a.rankingScore || 0)
          if (Math.abs(rankingDelta) > 1e-6) return rankingDelta

          const similarityDelta = (b.similarity || 0) - (a.similarity || 0)
          if (Math.abs(similarityDelta) > 1e-6) return similarityDelta

          return (b.score || 0) - (a.score || 0)
        })
        .slice(0, limit * 2)
    } catch (error) {
      logger.error('Error in diverse search:', error)
      return []
    }
  }
  async searchByKeywords(query, limit = 10) {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 3)

    if (keywords.length === 0) return []

    try {
      const postSQL = `
        SELECT 'post' as type, reddit_id, subreddit, title, content, author, 
               score, upvotes, created_utc, url, tags, 0.8 as similarity
        FROM reddit_posts 
        WHERE (LOWER(title) LIKE $1 OR LOWER(content) LIKE $1)
           OR (LOWER(title) LIKE $2 OR LOWER(content) LIKE $2)  
           OR (LOWER(title) LIKE $3 OR LOWER(content) LIKE $3)
        ORDER BY score DESC, upvotes DESC
        LIMIT $4
      `

      const commentSQL = `
        SELECT 'comment' as type, reddit_id, subreddit, content as title, content, author,
               score, upvotes, created_utc, NULL as url, tags, 0.7 as similarity
        FROM reddit_comments 
        WHERE (LOWER(content) LIKE $1 OR LOWER(content) LIKE $2 OR LOWER(content) LIKE $3)
        ORDER BY score DESC, upvotes DESC
        LIMIT $4
      `

      const keywordParams = keywords.map(keyword => `%${keyword}%`)

      while (keywordParams.length < 3) {
        keywordParams.push('%nonexistentterm%')
      }

      const params = [...keywordParams, Math.ceil(limit / 2)]

      const [postResult, commentResult] = await Promise.all([
        this.pool.query(postSQL, params),
        this.pool.query(commentSQL, params),
      ])

      const allResults = [...(postResult.rows || []), ...(commentResult.rows || [])]

      return allResults.slice(0, limit)
    } catch (error) {
      logger.error('Error in searchByKeywords:', error)
      return []
    }
  }

  removeDuplicates(results) {
    const seen = new Set()
    const seenContent = new Set()
    const unique = []

    for (const result of results) {
      const id = result.reddit_id
      if (seen.has(id)) continue

      const contentKey = (result.content || result.title || '').toLowerCase().slice(0, 100)
      if (seenContent.has(contentKey)) continue

      seen.add(id)
      seenContent.add(contentKey)
      unique.push(result)
    }

    return unique
  }

  extractSearchTerms(query) {
    return (query || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .slice(0, 8)
  }

  countTermMatches(text, terms) {
    if (!text || !terms.length) return 0

    const haystack = String(text).toLowerCase()
    let matches = 0

    for (const term of terms) {
      if (haystack.includes(term)) matches++
    }

    return matches
  }

  scoreSearchResult(result, queryTerms) {
    const strategyWeights = {
      vector: 1,
      text: 0.85,
      keywords: 0.65,
    }

    const normalizedSimilarity = Math.max(0, Math.min(1, Number(result.similarity) || 0))
    const titleMatches = this.countTermMatches(result.title, queryTerms)
    const contentMatches = this.countTermMatches(result.content, queryTerms)
    const subredditMatches = this.countTermMatches(result.subreddit, queryTerms)
    const totalPossibleMatches = queryTerms.length * 2 + 1
    const lexicalScore =
      totalPossibleMatches > 0
        ? Math.min(1, (titleMatches * 1.2 + contentMatches + subredditMatches * 0.5) / totalPossibleMatches)
        : 0

    const engagementBase = Math.max(0, Number(result.upvotes) || Number(result.score) || 0)
    const engagementScore = Math.min(1, Math.log10(engagementBase + 1) / 3)
    const strategyWeight = strategyWeights[result.sourceStrategy] || 0.75
    const exactTitleBonus =
      titleMatches > 0 && queryTerms.length > 0 && titleMatches >= Math.ceil(queryTerms.length / 2)
        ? 0.08
        : 0

    return (
      normalizedSimilarity * 0.55 +
      lexicalScore * 0.3 +
      engagementScore * 0.07 +
      exactTitleBonus
    ) * strategyWeight
  }

  isZeroEmbedding(embedding) {
    if (!Array.isArray(embedding) || embedding.length === 0) return true
    let sum = 0
    for (const val of embedding) {
      sum += Math.abs(val)
      if (sum > 1e-6) return false
    }
    return true
  }
}

module.exports = KnowledgeBase
