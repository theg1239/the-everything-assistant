require('dotenv').config()

const { Pool } = require('pg')
const { embed } = require('ai')
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
    const knowledgeDbUrl = process.env.REDDIT_DATABASE || process.env.DATABASE_URL
    if (!knowledgeDbUrl) {
      throw new Error('REDDIT_DATABASE (preferred) or DATABASE_URL must be configured')
    }

    this.pool = new Pool({
      connectionString: knowledgeDbUrl,
    })
    const embeddingConfig = resolveEmbeddingConfig()
    this.embeddingProvider = embeddingConfig.provider
    this.embeddingModelId = embeddingConfig.modelId
    this.embeddingDim = embeddingConfig.dim
    this.openaiBaseURL = embeddingConfig.openaiBaseURL
    this.embeddingModel = this.createEmbeddingModel()
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
    logger.info(
      `Knowledge DB configured: ${process.env.REDDIT_DATABASE ? 'REDDIT_DATABASE' : 'DATABASE_URL'}`
    )
  }

  createEmbeddingModel() {
    if (this.embeddingProvider === 'google') {
      return google.textEmbeddingModel(this.embeddingModelId)
    }
    return null
  }

  getHeaderValue(headers, name) {
    if (!headers || !name) return undefined
    if (typeof headers.get === 'function') return headers.get(name) || undefined
    const key = name.toLowerCase()
    return headers[name] || headers[key]
  }

  async generateOpenAIEmbeddingDirect(value) {
    const url = `${this.openaiBaseURL.replace(/\/$/, '')}/embeddings`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.embeddingModelId,
        input: value,
        dimensions: this.embeddingDim,
        encoding_format: 'float',
      }),
    })

    const raw = await response.text()
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }

    if (!response.ok) {
      throw new Error(
        `Direct OpenAI embeddings call failed (${response.status}): ${parsed?.error?.message || raw.slice(0, 300)}`
      )
    }

    const embedding = parsed?.data?.[0]?.embedding
    if (!Array.isArray(embedding)) {
      throw new Error('Direct OpenAI embeddings call returned an invalid embedding payload')
    }

    return {
      embedding,
      response: {
        headers: response.headers,
      },
    }
  }

  async initialize() {
    try {
      await this.createTables()
      await this.migrateVectorDimensions()
      await this.migrateVideoColumn() // Add video column migration
      await this.migrateChunkSourceIdType()
      await this.createIndexes()
      await this.createTextSearchIndexes()
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

  async migrateChunkSourceIdType() {
    try {
      const result = await this.pool.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'knowledge_chunks'
          AND column_name = 'source_id'
      `)

      const dataType = result.rows[0]?.data_type?.toLowerCase()
      if (!dataType) return

      if (dataType !== 'bigint') {
        logger.info(
          `Migrating knowledge_chunks.source_id from "${dataType}" to "bigint" for Cockroach compatibility...`
        )
        await this.pool.query(`
          ALTER TABLE knowledge_chunks
          ALTER COLUMN source_id TYPE BIGINT USING source_id::BIGINT
        `)
        logger.info('knowledge_chunks.source_id migration completed successfully')
      }
    } catch (error) {
      logger.error('Error during knowledge_chunks.source_id migration:', error)
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
        source_id BIGINT NOT NULL,
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

  async createTextSearchIndexes() {
    const indexesSQL = `
      CREATE INDEX IF NOT EXISTS idx_posts_search_tsv
        ON reddit_posts USING gin (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')));
      CREATE INDEX IF NOT EXISTS idx_comments_search_tsv
        ON reddit_comments USING gin (to_tsvector('english', COALESCE(content, '')));
      CREATE INDEX IF NOT EXISTS idx_chunks_search_tsv
        ON knowledge_chunks USING gin (to_tsvector('english', COALESCE(chunk_text, '')));
    `

    try {
      await this.pool.query(indexesSQL)
      logger.info('Text search indexes are ready')
    } catch (error) {
      logger.warn(
        `Text search indexes could not be created on this database: ${this.formatErrorForLog(error)}`
      )
    }
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
      let result
      let embedding

      if (this.embeddingProvider === 'openai') {
        result = await this.generateOpenAIEmbeddingDirect(value)
        embedding = result.embedding
      } else {
        result = await embed({
          model: this.embeddingModel,
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
            `OpenAI embedding response headers hint: openai-model=${this.getHeaderValue(result?.response?.headers, 'openai-model') || 'unknown'}, openai-processing-ms=${this.getHeaderValue(result?.response?.headers, 'openai-processing-ms') || 'unknown'}, baseURL=${this.openaiBaseURL}`
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
      const vectorOnlyResults = await this.diverseSearch(query, limit)
      const responseTime = Date.now() - startTime
      await this.logSearchQuery(query, vectorOnlyResults.length, responseTime)
      return vectorOnlyResults.slice(0, limit)
    } catch (error) {
      logger.error('Error in search:', error)
      return []
    }
  }
  async vectorSearch(query, limit = 10) {
    const queryVariants = this.buildVectorQueryVariants(query)
    const candidateLimit = Math.max(limit, 80)
    const perVariantLimit = Math.max(
      Math.ceil(candidateLimit / Math.max(1, queryVariants.length)),
      24
    )
    const postLimit = Math.ceil(perVariantLimit * 0.5)
    const commentLimit = Math.ceil(perVariantLimit * 0.35)
    const chunkLimit = Math.ceil(perVariantLimit * 0.15)

    const merged = new Map()
    const rrfK = 50

    const variantResponses = await Promise.all(
      queryVariants.map(async variant => {
        const queryEmbedding = await this.generateEmbedding(variant, 'RETRIEVAL_QUERY')
        if (!queryEmbedding) {
          logger.warn(`Skipping vector variant "${variant}" because embedding is unavailable`)
          return { variant, rows: [] }
        }

        const rows = await this.runVectorSearchWithEmbedding(
          queryEmbedding,
          postLimit,
          commentLimit,
          chunkLimit,
          perVariantLimit
        )
        return { variant, rows }
      })
    )

    for (const { variant, rows } of variantResponses) {
      rows.forEach((row, index) => {
        const key = `${row.type}:${row.reddit_id}`
        const existing = merged.get(key)
        const rrfContribution = 1 / (rrfK + index + 1)
        const similarity = Math.max(
          0,
          Math.min(1, Number(row.similarity) + (variant === query ? 0.015 : 0))
        )

        if (!existing) {
          merged.set(key, {
            ...row,
            matchedVectorQuery: variant,
            similarity,
            rrfScore: rrfContribution,
          })
          return
        }

        existing.rrfScore = (existing.rrfScore || 0) + rrfContribution
        if (similarity > (existing.similarity || 0)) {
          existing.similarity = similarity
          existing.matchedVectorQuery = variant
        }
      })
    }

    if (merged.size === 0) {
      logger.warn('Skipping vector search because query embedding is unavailable')
      return []
    }

    return Array.from(merged.values())
      .sort((a, b) => {
        const rrfDelta = (b.rrfScore || 0) - (a.rrfScore || 0)
        if (Math.abs(rrfDelta) > 1e-8) return rrfDelta
        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, candidateLimit)
      .map(result => ({
        ...result,
        similarity: parseFloat((result.similarity || 0).toFixed(3)),
      }))
  }

  async textSearch(query, limit = 10) {
    logger.info(`Performing text search for: "${query}"`)

    const queryText = String(query || '').trim()
    const queryTerms = this.extractSearchTerms(queryText).slice(0, 10)
    const orTsQuery = queryTerms
      .map(term => term.replace(/[^\w]/g, ''))
      .filter(Boolean)
      .slice(0, 8)
      .map(term => `${term}:*`)
      .join(' | ')
    if (!queryText) return []

    const textSearchSQL = `
      WITH input AS (
        SELECT
          websearch_to_tsquery('english', $1) AS strict_q,
          plainto_tsquery('english', $1) AS plain_q,
          CASE
            WHEN $4::text <> '' THEN to_tsquery('english', $4)
            ELSE NULL::tsquery
          END AS or_q,
          $3::text[] AS terms
      ),
      post_results AS (
        SELECT
          'post'::text AS type,
          p.reddit_id::text AS reddit_id,
          p.subreddit::text AS subreddit,
          p.title::text AS title,
          COALESCE(p.content, '')::text AS content,
          p.author::text AS author,
          COALESCE(p.score, 0)::int AS score,
          COALESCE(p.upvotes, 0)::int AS upvotes,
          p.created_utc AS created_utc,
          p.url::text AS url,
          COALESCE(p.tags, ARRAY[]::text[]) AS tags,
          COALESCE(p.is_video, false)::boolean AS is_video,
          COALESCE(p.post_type, 'post')::text AS post_type,
          p.images::jsonb AS images,
          p.video::jsonb AS video,
          GREATEST(
            ts_rank_cd(
              to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')),
              input.strict_q,
              32
            ),
            ts_rank_cd(
              to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')),
              input.plain_q,
              32
            ),
            CASE
              WHEN input.or_q IS NULL THEN 0
              ELSE ts_rank_cd(
                to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')),
                input.or_q,
                32
              )
            END
          )::double precision AS text_rank
        FROM reddit_posts p
        CROSS JOIN input
        WHERE
          to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')) @@ input.strict_q
          OR to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')) @@ input.plain_q
          OR (
            input.or_q IS NOT NULL
            AND to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')) @@ input.or_q
          )
        ORDER BY text_rank DESC, p.score DESC
        LIMIT $2
      ),
      comment_results AS (
        SELECT
          'comment'::text AS type,
          c.reddit_id::text AS reddit_id,
          c.subreddit::text AS subreddit,
          LEFT(COALESCE(c.content, ''), 180)::text AS title,
          COALESCE(c.content, '')::text AS content,
          c.author::text AS author,
          COALESCE(c.score, 0)::int AS score,
          COALESCE(c.upvotes, 0)::int AS upvotes,
          c.created_utc AS created_utc,
          NULL::text AS url,
          COALESCE(c.tags, ARRAY[]::text[]) AS tags,
          false::boolean AS is_video,
          'comment'::text AS post_type,
          NULL::jsonb AS images,
          NULL::jsonb AS video,
          GREATEST(
            ts_rank_cd(to_tsvector('english', COALESCE(c.content, '')), input.strict_q, 32),
            ts_rank_cd(to_tsvector('english', COALESCE(c.content, '')), input.plain_q, 32),
            CASE
              WHEN input.or_q IS NULL THEN 0
              ELSE ts_rank_cd(to_tsvector('english', COALESCE(c.content, '')), input.or_q, 32)
            END
          )::double precision AS text_rank
        FROM reddit_comments c
        CROSS JOIN input
        WHERE
          to_tsvector('english', COALESCE(c.content, '')) @@ input.strict_q
          OR to_tsvector('english', COALESCE(c.content, '')) @@ input.plain_q
          OR (
            input.or_q IS NOT NULL
            AND to_tsvector('english', COALESCE(c.content, '')) @@ input.or_q
          )
        ORDER BY text_rank DESC, c.score DESC
        LIMIT $2
      ),
      chunk_results AS (
        SELECT
          'chunk'::text AS type,
          kc.source_id::text AS reddit_id,
          kc.subreddit::text AS subreddit,
          LEFT(COALESCE(kc.chunk_text, ''), 180)::text AS title,
          COALESCE(kc.chunk_text, '')::text AS content,
          NULL::text AS author,
          0::int AS score,
          0::int AS upvotes,
          kc.created_at AS created_utc,
          NULL::text AS url,
          ARRAY[]::text[] AS tags,
          false::boolean AS is_video,
          'chunk'::text AS post_type,
          NULL::jsonb AS images,
          NULL::jsonb AS video,
          GREATEST(
            ts_rank_cd(to_tsvector('english', COALESCE(kc.chunk_text, '')), input.strict_q, 32),
            ts_rank_cd(to_tsvector('english', COALESCE(kc.chunk_text, '')), input.plain_q, 32),
            CASE
              WHEN input.or_q IS NULL THEN 0
              ELSE ts_rank_cd(to_tsvector('english', COALESCE(kc.chunk_text, '')), input.or_q, 32)
            END
          )::double precision AS text_rank
        FROM knowledge_chunks kc
        CROSS JOIN input
        WHERE
          to_tsvector('english', COALESCE(kc.chunk_text, '')) @@ input.strict_q
          OR to_tsvector('english', COALESCE(kc.chunk_text, '')) @@ input.plain_q
          OR (
            input.or_q IS NOT NULL
            AND to_tsvector('english', COALESCE(kc.chunk_text, '')) @@ input.or_q
          )
        ORDER BY text_rank DESC, kc.relevance_score DESC
        LIMIT $2
      )
      SELECT *
      FROM (
        SELECT * FROM post_results
        UNION ALL
        SELECT * FROM comment_results
        UNION ALL
        SELECT * FROM chunk_results
      ) AS combined
      ORDER BY text_rank DESC, score DESC
      LIMIT $2
    `

    try {
      const result = await this.pool.query(textSearchSQL, [queryText, limit, queryTerms, orTsQuery])
      return result.rows.map(row => {
        const textRank = Math.max(0, Number(row.text_rank) || 0)
        return {
          ...row,
          textRank: textRank,
          similarity: parseFloat(Math.min(1, textRank).toFixed(3)),
        }
      })
    } catch (error) {
      logger.error(`Text search failed, trying simpler search: ${this.formatErrorForLog(error)}`)

      const simpleSearchSQL = `
        SELECT *
        FROM (
          SELECT
            'post'::text AS type,
            p.reddit_id::text AS reddit_id,
            p.subreddit::text AS subreddit,
            p.title::text AS title,
            COALESCE(p.content, '')::text AS content,
            p.author::text AS author,
            COALESCE(p.score, 0)::int AS score,
            COALESCE(p.upvotes, 0)::int AS upvotes,
            p.created_utc AS created_utc,
            p.url::text AS url,
            COALESCE(p.tags, ARRAY[]::text[]) AS tags,
            COALESCE(p.is_video, false)::boolean AS is_video,
            COALESCE(p.post_type, 'post')::text AS post_type,
            p.images::jsonb AS images,
            p.video::jsonb AS video,
            0.45::double precision AS text_rank
          FROM reddit_posts p
          WHERE COALESCE(p.title, '') ILIKE $1 OR COALESCE(p.content, '') ILIKE $1
          UNION ALL
          SELECT
            'comment'::text AS type,
            c.reddit_id::text AS reddit_id,
            c.subreddit::text AS subreddit,
            LEFT(COALESCE(c.content, ''), 180)::text AS title,
            COALESCE(c.content, '')::text AS content,
            c.author::text AS author,
            COALESCE(c.score, 0)::int AS score,
            COALESCE(c.upvotes, 0)::int AS upvotes,
            c.created_utc AS created_utc,
            NULL::text AS url,
            COALESCE(c.tags, ARRAY[]::text[]) AS tags,
            false::boolean AS is_video,
            'comment'::text AS post_type,
            NULL::jsonb AS images,
            NULL::jsonb AS video,
            0.4::double precision AS text_rank
          FROM reddit_comments c
          WHERE COALESCE(c.content, '') ILIKE $1
        ) AS fallback_results
        ORDER BY text_rank DESC, score DESC
        LIMIT $2
      `

      const searchPattern = `%${queryText}%`
      const result = await this.pool.query(simpleSearchSQL, [searchPattern, limit])
      return result.rows.map(row => ({
        ...row,
        textRank: Math.max(0, Number(row.text_rank) || 0),
        similarity: Math.max(0, Math.min(1, Number(row.text_rank) || 0)),
      }))
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

  formatErrorForLog(error) {
    if (!error) return 'Unknown error'
    if (error instanceof Error) return error.message || error.toString()
    if (typeof error === 'object') {
      try {
        return JSON.stringify(error)
      } catch {
        return String(error)
      }
    }
    return String(error)
  }

  async diverseSearch(query, limit = 10) {
    try {
      const candidateLimit = Math.max(limit * 5, 50)
      logger.info('Trying vector search strategy...')
      const vectorPromise = this.vectorSearch(query, candidateLimit).catch(error => {
        logger.warn(`vector search strategy failed: ${this.formatErrorForLog(error)}`)
        return []
      })

      logger.info('Trying text search strategy...')
      const textPromise = this.textSearch(query, candidateLimit).catch(error => {
        logger.warn(`text search strategy failed: ${this.formatErrorForLog(error)}`)
        return []
      })

      let [vectorResults, textResults] = await Promise.all([vectorPromise, textPromise])
      let keywordResults = []

      if ((!vectorResults || vectorResults.length === 0) && (!textResults || textResults.length === 0)) {
        logger.info('Trying keywords search strategy...')
        keywordResults = await this.searchByKeywords(query, candidateLimit)
      }

      logger.info(`vector search found ${(vectorResults || []).length} results`)
      logger.info(`text search found ${(textResults || []).length} results`)
      if (keywordResults.length > 0) {
        logger.info(`keywords search found ${keywordResults.length} results`)
      }

      const fusedResults = this.fuseResultsByRrf(
        [
          { strategy: 'vector', results: vectorResults || [] },
          { strategy: 'text', results: textResults || [] },
          { strategy: 'keywords', results: keywordResults || [] },
        ],
        candidateLimit
      )

      if (fusedResults.length === 0) return []

      const uniqueResults = this.removeDuplicates(fusedResults)
      logger.info(`After deduplication: ${uniqueResults.length} unique results`)

      const queryTerms = this.extractSearchTerms(query)
      const termWeights = this.buildDynamicTermWeights(queryTerms, uniqueResults)
      const rankedResults = uniqueResults
        .map(result => ({
          ...result,
          rankingScore: this.scoreSearchResult(result, queryTerms, termWeights),
        }))
        .sort((a, b) => {
          const rankingDelta = (b.rankingScore || 0) - (a.rankingScore || 0)
          if (Math.abs(rankingDelta) > 1e-6) return rankingDelta

          const fusionDelta = (b.rrfScore || 0) - (a.rrfScore || 0)
          if (Math.abs(fusionDelta) > 1e-8) return fusionDelta

          const similarityDelta = (b.similarity || 0) - (a.similarity || 0)
          if (Math.abs(similarityDelta) > 1e-6) return similarityDelta

          return (b.score || 0) - (a.score || 0)
        })
        .slice(0, Math.max(limit * 4, 40))

      return this.diversifyByType(rankedResults, Math.max(limit * 4, 40))
    } catch (error) {
      logger.error('Error in diverse search:', error)
      return []
    }
  }

  fuseResultsByRrf(strategyBuckets, candidateLimit) {
    const merged = new Map()
    const rrfK = 60
    const strategyWeight = {
      vector: 1,
      text: 1.22,
      keywords: 0.85,
    }

    for (const bucket of strategyBuckets) {
      const strategy = bucket?.strategy || 'unknown'
      const results = Array.isArray(bucket?.results) ? bucket.results : []

      results.forEach((result, index) => {
        const key = `${result.type}:${result.reddit_id}`
        const existing = merged.get(key)
        const rrfContribution =
          (1 / (rrfK + index + 1)) * (strategyWeight[strategy] || 1)
        const similarity = Math.max(0, Math.min(1, Number(result.similarity) || 0))
        const textRank = Math.max(0, Number(result.textRank ?? result.text_rank) || 0)

        if (!existing) {
          merged.set(key, {
            ...result,
            similarity,
            textRank,
            rrfScore: rrfContribution,
            sourceStrategy: strategy,
            sourceStrategies: [strategy],
          })
          return
        }

        existing.rrfScore = (existing.rrfScore || 0) + rrfContribution
        existing.similarity = Math.max(existing.similarity || 0, similarity)
        existing.textRank = Math.max(existing.textRank || 0, textRank)
        existing.score = Math.max(Number(existing.score) || 0, Number(result.score) || 0)
        existing.upvotes = Math.max(Number(existing.upvotes) || 0, Number(result.upvotes) || 0)
        if (!existing.sourceStrategies.includes(strategy)) {
          existing.sourceStrategies.push(strategy)
        }
      })
    }

    return Array.from(merged.values())
      .sort((a, b) => {
        const rrfDelta = (b.rrfScore || 0) - (a.rrfScore || 0)
        if (Math.abs(rrfDelta) > 1e-8) return rrfDelta

        const textDelta = (b.textRank || 0) - (a.textRank || 0)
        if (Math.abs(textDelta) > 1e-8) return textDelta

        return (b.similarity || 0) - (a.similarity || 0)
      })
      .slice(0, candidateLimit)
  }
  async searchByKeywords(query, limit = 10) {
    const keywords = this.extractSearchTerms(query).slice(0, 12)

    if (keywords.length === 0) return []

    try {
      const postSQL = `
        SELECT
          'post' AS type,
          reddit_id, subreddit, title, content, author,
          score, upvotes, created_utc, url, tags,
          (0.55 + LEAST(0.45, term_match_count::float / GREATEST($2::float, 1))) AS similarity
        FROM (
          SELECT
            reddit_id, subreddit, title, content, author,
            score, upvotes, created_utc, url, tags,
            (
              SELECT COUNT(*)
              FROM unnest($1::text[]) AS term
              WHERE lower(coalesce(title, '')) ~ ('\\m' || term || '\\M')
                 OR lower(coalesce(content, '')) ~ ('\\m' || term || '\\M')
            ) AS term_match_count
          FROM reddit_posts
        ) AS posts_ranked
        WHERE term_match_count > 0
        ORDER BY term_match_count DESC, score DESC, upvotes DESC
        LIMIT $3
      `

      const commentSQL = `
        SELECT
          'comment' AS type,
          reddit_id, subreddit, LEFT(content, 120) AS title, content, author,
          score, upvotes, created_utc, NULL::text AS url, tags,
          (0.5 + LEAST(0.45, term_match_count::float / GREATEST($2::float, 1))) AS similarity
        FROM (
          SELECT
            reddit_id, subreddit, content, author,
            score, upvotes, created_utc, tags,
            (
              SELECT COUNT(*)
              FROM unnest($1::text[]) AS term
              WHERE lower(coalesce(content, '')) ~ ('\\m' || term || '\\M')
            ) AS term_match_count
          FROM reddit_comments
        ) AS comments_ranked
        WHERE term_match_count > 0
        ORDER BY term_match_count DESC, score DESC, upvotes DESC
        LIMIT $3
      `

      const params = [keywords, keywords.length, Math.ceil(limit / 2)]

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
    const typePriority = { post: 0, comment: 1, chunk: 2 }
    const orderedResults = [...results].sort((a, b) => {
      const priorityA = typePriority[a.type] ?? 3
      const priorityB = typePriority[b.type] ?? 3
      if (priorityA !== priorityB) return priorityA - priorityB
      return (Number(b.similarity) || 0) - (Number(a.similarity) || 0)
    })

    const seenIds = new Set()
    const seenFingerprints = []
    const nonChunkFingerprints = []
    const unique = []

    for (const result of orderedResults) {
      const idKey = `${result.type}:${result.reddit_id}`
      if (seenIds.has(idKey)) continue

      const fingerprint = this.createResultFingerprint(result)
      const isDuplicate = seenFingerprints.some(existing =>
        this.isNearDuplicateFingerprint(fingerprint, existing)
      )
      if (isDuplicate) continue

      if (result.type === 'chunk') {
        const overlapsNonChunk = nonChunkFingerprints.some(existing =>
          this.isNearDuplicateFingerprint(fingerprint, existing)
        )
        if (overlapsNonChunk) continue
      }

      seenIds.add(idKey)
      seenFingerprints.push(fingerprint)
      if (result.type !== 'chunk') {
        nonChunkFingerprints.push(fingerprint)
      }
      unique.push(result)
    }

    return unique.sort((a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0))
  }

  extractSearchTerms(query) {
    const normalized = String(query || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!normalized) return []

    const terms = normalized.split(' ').filter(term => term.length >= 3)
    return Array.from(new Set(terms)).slice(0, 14)
  }

  escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  countTermMatches(text, terms) {
    if (!text || !Array.isArray(terms) || terms.length === 0) return 0

    const haystack = String(text).toLowerCase()
    let matches = 0

    for (const term of terms) {
      const pattern = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'i')
      if (pattern.test(haystack)) matches++
    }

    return matches
  }

  buildDynamicTermWeights(queryTerms, candidateResults) {
    const terms = Array.isArray(queryTerms) ? queryTerms : []
    const results = Array.isArray(candidateResults) ? candidateResults : []
    if (terms.length === 0 || results.length === 0) return {}

    const docCount = Math.max(1, results.length)
    const rawWeights = {}

    for (const term of terms) {
      let documentFrequency = 0
      for (const result of results) {
        const text = `${result.title || ''} ${result.content || ''} ${result.subreddit || ''}`
        if (this.countTermMatches(text, [term]) > 0) {
          documentFrequency += 1
        }
      }
      rawWeights[term] = Math.log((docCount + 1) / (documentFrequency + 1)) + 1
    }

    const values = Object.values(rawWeights)
    const maxWeight = Math.max(...values, 1)
    const minWeight = Math.min(...values, 1)
    const normalizedWeights = {}

    for (const term of terms) {
      const raw = rawWeights[term] || 1
      if (maxWeight === minWeight) {
        normalizedWeights[term] = 1
        continue
      }

      const scaled = (raw - minWeight) / (maxWeight - minWeight)
      normalizedWeights[term] = 0.65 + scaled * 0.7
    }

    return normalizedWeights
  }

  countWeightedTermMatches(text, queryTerms, termWeights = {}) {
    if (!text || !queryTerms.length) return 0
    const haystack = String(text).toLowerCase()
    let weightedMatches = 0
    for (const term of queryTerms) {
      const pattern = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'i')
      if (pattern.test(haystack)) {
        weightedMatches += termWeights[term] || 1
      }
    }
    return weightedMatches
  }

  scoreSearchResult(result, queryTerms, termWeights = {}) {
    const normalizedSimilarity = Math.max(0, Math.min(1, Number(result.similarity) || 0))
    const normalizedTextRank = Math.min(
      1,
      Math.log1p(Math.max(0, Number(result.textRank ?? result.text_rank) || 0)) / Math.log(2.5)
    )
    const weightedTitleMatches = this.countWeightedTermMatches(result.title, queryTerms, termWeights)
    const weightedContentMatches = this.countWeightedTermMatches(
      result.content,
      queryTerms,
      termWeights
    )
    const weightedSubredditMatches = this.countWeightedTermMatches(
      result.subreddit,
      queryTerms,
      termWeights
    )
    const totalPossibleWeight = queryTerms.reduce((sum, term) => sum + (termWeights[term] || 1), 0)
    const lexicalScore =
      totalPossibleWeight > 0
        ? Math.min(
            1,
            (weightedTitleMatches * 1.25 + weightedContentMatches + weightedSubredditMatches * 0.4) /
              (totalPossibleWeight * 2.2)
          )
        : 0
    const contentText = `${result.title || ''} ${result.content || ''}`
    const exactTermMatches = this.countTermMatches(contentText, queryTerms)
    const lexicalCoverage = queryTerms.length > 0 ? exactTermMatches / queryTerms.length : 0
    const highSignalTerms = queryTerms.filter(term => (termWeights[term] || 1) > 1.0)
    const highSignalMatches = this.countTermMatches(contentText, highSignalTerms)

    const engagementBase = Math.max(
      0,
      Number(result.upvotes) || 0,
      Number(result.score) || 0
    )
    const engagementScore = Math.min(1, Math.log10(engagementBase + 1) / 3)
    const rrfScore = Math.max(0, Number(result.rrfScore) || 0)
    const normalizedRrfScore = Math.min(1, rrfScore * 120)
    const sourceStrategies = Array.isArray(result.sourceStrategies)
      ? result.sourceStrategies
      : result.sourceStrategy
        ? [result.sourceStrategy]
        : []
    const multiStrategyBonus = sourceStrategies.length > 1 ? 0.06 : 0
    const typeWeight = result.type === 'post' ? 1 : result.type === 'comment' ? 0.88 : 0.65
    const highSignalPenalty =
      highSignalTerms.length > 0 && highSignalMatches === 0
        ? 0.72
        : 1
    const weakCoveragePenalty = lexicalCoverage < 0.2 ? 0.8 : lexicalCoverage < 0.35 ? 0.9 : 1

    let recencyScore = 0.5
    if (result.created_utc) {
      const created = new Date(result.created_utc)
      if (!Number.isNaN(created.getTime())) {
        const ageInDays = Math.max(0, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
        recencyScore = Math.max(0.2, 1 - ageInDays / 730)
      }
    }

    const semanticComponent = normalizedSimilarity * (0.65 + lexicalScore * 0.35)
    const textComponent = normalizedTextRank * (0.55 + lexicalScore * 0.45)

    return (
      (semanticComponent * 0.33 +
        textComponent * 0.23 +
        lexicalScore * 0.25 +
        engagementScore * 0.08 +
        normalizedRrfScore * 0.07 +
        recencyScore * 0.03 +
        multiStrategyBonus) *
      typeWeight *
      highSignalPenalty *
      weakCoveragePenalty
    )
  }

  buildVectorQueryVariants(query) {
    const normalizedQuery = String(query || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!normalizedQuery) return []

    const terms = this.extractSearchTerms(normalizedQuery)
    const variants = [normalizedQuery]

    if (terms.length > 0) {
      variants.push(terms.join(' '))
      if (terms.length > 6) {
        variants.push(terms.slice(0, 6).join(' '))
      }
    }

    const normalizedPunctuation = normalizedQuery
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (normalizedPunctuation && normalizedPunctuation !== normalizedQuery) {
      variants.push(normalizedPunctuation)
    }

    return Array.from(new Set(variants)).slice(0, 4)
  }

  createResultFingerprint(result) {
    const text = `${result.title || ''} ${result.content || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return ''

    return text
      .split(' ')
      .filter(token => token.length > 2)
      .slice(0, 60)
      .join(' ')
  }

  isNearDuplicateFingerprint(current, existing) {
    if (!current || !existing) return false
    if (current === existing) return true

    const currentHead = current.slice(0, 140)
    const existingHead = existing.slice(0, 140)
    if (!currentHead || !existingHead) return false

    if (current.includes(existingHead) || existing.includes(currentHead)) return true

    const currentTokens = new Set(currentHead.split(' ').filter(Boolean))
    const existingTokens = new Set(existingHead.split(' ').filter(Boolean))
    if (currentTokens.size < 6 || existingTokens.size < 6) return false

    let overlap = 0
    for (const token of currentTokens) {
      if (existingTokens.has(token)) overlap++
    }
    const overlapRatio = overlap / Math.min(currentTokens.size, existingTokens.size)
    return overlapRatio >= 0.84
  }

  diversifyByType(results, targetLimit) {
    if (!Array.isArray(results) || results.length === 0) return []

    const maxCounts = {
      post: Math.ceil(targetLimit * 0.65),
      comment: Math.ceil(targetLimit * 0.55),
      chunk: Math.ceil(targetLimit * 0.2),
    }
    const counts = { post: 0, comment: 0, chunk: 0 }
    const selected = []
    const deferred = []

    for (const result of results) {
      const type = result.type || 'comment'
      const maxAllowed = maxCounts[type] ?? targetLimit
      const currentCount = counts[type] ?? 0

      if (selected.length < targetLimit && currentCount < maxAllowed) {
        selected.push(result)
        counts[type] = currentCount + 1
      } else {
        deferred.push(result)
      }
    }

    for (const result of deferred) {
      if (selected.length >= targetLimit) break
      selected.push(result)
    }

    return selected
  }

  async runVectorSearchWithEmbedding(
    queryEmbedding,
    postLimit,
    commentLimit,
    chunkLimit,
    candidateLimit
  ) {
    const searchSQL = `
      WITH post_results AS (
        SELECT
          'post' AS type,
          reddit_id, subreddit, title, content, author,
          score, upvotes, created_utc, url, tags,
          is_video, post_type::text AS post_type,
          to_jsonb(images) AS images,
          to_jsonb(video) AS video,
          1 - (embedding <=> $1::vector) AS similarity
        FROM reddit_posts
        WHERE embedding IS NOT NULL
        ORDER BY similarity DESC
        LIMIT $2
      ),
      comment_results AS (
        SELECT
          'comment' AS type,
          reddit_id, subreddit, content AS title, content,
          author, score, upvotes, created_utc, NULL::text AS url, tags,
          false AS is_video, 'comment'::text AS post_type, NULL::jsonb AS images, NULL::jsonb AS video,
          1 - (embedding <=> $1::vector) AS similarity
        FROM reddit_comments
        WHERE embedding IS NOT NULL
        ORDER BY similarity DESC
        LIMIT $3
      ),
      chunk_results AS (
        SELECT
          'chunk' AS type,
          source_id::text AS reddit_id, subreddit,
          chunk_text AS title, chunk_text AS content,
          NULL AS author, relevance_score AS score,
          0 AS upvotes, created_at AS created_utc,
          NULL::text AS url, ARRAY[]::text[] AS tags,
          false AS is_video, 'chunk'::text AS post_type, NULL::jsonb AS images, NULL::jsonb AS video,
          1 - (embedding <=> $1::vector) AS similarity
        FROM knowledge_chunks
        WHERE embedding IS NOT NULL
        ORDER BY similarity DESC
        LIMIT $4
      )
      SELECT * FROM (
        SELECT * FROM post_results
        UNION ALL
        SELECT * FROM comment_results
        UNION ALL
        SELECT * FROM chunk_results
      ) AS combined
      ORDER BY similarity DESC
      LIMIT $5
    `

    const result = await this.pool.query(searchSQL, [
      `[${queryEmbedding.join(',')}]`,
      postLimit,
      commentLimit,
      chunkLimit,
      candidateLimit,
    ])

    return result.rows
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
