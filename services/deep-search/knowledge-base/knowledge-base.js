require('dotenv').config({ quiet: true })

const { Pool } = require('pg')
const { embed, embedMany } = require('ai')
const { createOpenAI } = require('@ai-sdk/openai')
const logger = require('../utils/logger')

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

function resolveEmbeddingConfig() {
  const modelRaw =
    process.env.DEEP_SEARCH_EMBEDDING_MODEL ||
    process.env.RAG_EMBEDDING_MODEL ||
    process.env.OPENAI_EMBEDDING_MODEL ||
    process.env.EMBEDDING_MODEL
  const dim = parsePositiveInt(
    process.env.DEEP_SEARCH_EMBEDDING_DIM ||
      process.env.RAG_EMBEDDING_DIM ||
      process.env.EMBEDDING_DIM,
    768
  )

  const modelId = (modelRaw || 'text-embedding-3-large').replace(/^openai\//i, '').trim()

  const openaiBaseURL =
    process.env.DEEP_SEARCH_OPENAI_BASE_URL ||
    process.env.RAG_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'

  return { provider: 'openai', modelId, dim, openaiBaseURL }
}

class KnowledgeBase {
  constructor() {
    // The Reddit knowledge base lives in its own database. No DATABASE_URL fallback:
    // that's the main app's database, and the CREATE TABLE IF NOT EXISTS bootstrap
    // below would silently recreate these tables there.
    const knowledgeDbUrl = process.env.REDDIT_DATABASE
    if (!knowledgeDbUrl) {
      throw new Error('REDDIT_DATABASE must be configured')
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

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required for OpenAI embeddings')
    }

    logger.info(
      `Embedding config: provider=${this.embeddingProvider}, model=${this.embeddingModelId}, dim=${this.embeddingDim}, openaiBaseURL=${this.openaiBaseURL}`
    )
    logger.info('Knowledge DB configured: REDDIT_DATABASE')
  }

  createEmbeddingModel() {
    const provider = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: this.openaiBaseURL,
    })
    return provider.embeddingModel(this.embeddingModelId)
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
    const textContent = `${postData.title} ${postData.content} ${postData.extracted_text}`.trim()
    // Embed the post and its chunks in one batch, before taking a connection: no transaction
    // (or pooled client) is held open across the provider round trips.
    const chunks = this.knowledgeChunksFor(textContent)
    const [embedding, ...chunkEmbeddings] = await this.generateEmbeddings([textContent, ...chunks])

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

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
      await this.insertKnowledgeChunks(
        client,
        chunks,
        chunkEmbeddings,
        'post',
        postId,
        postData.subreddit
      )
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
    if (!commentData.reddit_id) {
      const error = new Error('Comment reddit_id is required')
      logger.error(`Error storing comment unknown:`, error)
      throw error
    }
    if (!commentData.content || !commentData.content.trim()) {
      const error = new Error('Comment content is required')
      logger.error(`Error storing comment ${commentData.reddit_id}:`, error)
      throw error
    }

    // As in storePost: embed the comment and its chunks in one batch before taking a connection.
    const chunks =
      commentData.content.length > 200 ? this.knowledgeChunksFor(commentData.content) : []
    const [embedding, ...chunkEmbeddings] = await this.generateEmbeddings([
      commentData.content,
      ...chunks,
    ])

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

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
      await this.insertKnowledgeChunks(
        client,
        chunks,
        chunkEmbeddings,
        'comment',
        commentId,
        commentData.subreddit
      )
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

  /** The chunks stored alongside `text` in knowledge_chunks ([] when it's too short to chunk). */
  knowledgeChunksFor(text) {
    if (!text || text.length < 100) return []
    return this.splitTextIntoChunks(text)
  }

  /** Inserts `chunks` (with their precomputed embeddings; null ones are skipped) on `client`. */
  async insertKnowledgeChunks(client, chunks, embeddings, sourceType, sourceId, subreddit) {
    const insertChunkSQL = `
      INSERT INTO knowledge_chunks (
        source_type, source_id, chunk_text, chunk_index, subreddit, embedding, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = embeddings[i]
      if (!embedding) continue

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

  /** The embedding if it's usable for storage/search, otherwise null (with a log line). */
  checkEmbedding(embedding) {
    if (!Array.isArray(embedding) || embedding.length !== this.embeddingDim) {
      logger.error(
        `Embedding dimension mismatch: got ${embedding?.length}, expected ${this.embeddingDim} (provider=${this.embeddingProvider}, model=${this.embeddingModelId})`
      )
      return null
    }
    if (this.isZeroEmbedding(embedding)) {
      logger.warn('Generated a zero embedding; skipping vector storage/search')
      return null
    }
    return embedding
  }

  async generateEmbedding(text) {
    if (!text || !text.trim()) {
      return null
    }
    try {
      const value = text.substring(0, this.maxContextLength)
      const { embedding } = await embed({
        model: this.embeddingModel,
        value,
        dimensions: this.embeddingDim,
      })
      return this.checkEmbedding(embedding)
    } catch (error) {
      logger.error('Error generating embedding:', error)
      return null
    }
  }

  /**
   * Embeds several texts with one provider request (embedMany splits it if the model caps the batch
   * size) instead of one request per text. Resolves to one embedding per text, null for blank or
   * unusable ones. If the batch request fails, each text is embedded on its own so one bad input
   * doesn't lose the others.
   */
  async generateEmbeddings(texts) {
    const results = texts.map(() => null)
    const pending = []
    texts.forEach((text, index) => {
      if (text && text.trim()) pending.push({ index, text })
    })
    if (pending.length === 0) return results
    if (pending.length === 1) {
      results[pending[0].index] = await this.generateEmbedding(pending[0].text)
      return results
    }

    try {
      const { embeddings } = await embedMany({
        model: this.embeddingModel,
        values: pending.map(({ text }) => text.substring(0, this.maxContextLength)),
        dimensions: this.embeddingDim,
        maxParallelCalls: 2,
      })
      pending.forEach(({ index }, position) => {
        results[index] = this.checkEmbedding(embeddings[position])
      })
      return results
    } catch (error) {
      logger.warn(
        `Batch embedding of ${pending.length} texts failed, embedding individually: ${this.formatErrorForLog(error)}`
      )
      const individual = await Promise.all(pending.map(({ text }) => this.generateEmbedding(text)))
      pending.forEach(({ index }, position) => {
        results[index] = individual[position]
      })
      return results
    }
  }

  /**
   * Candidate retrieval: pgvector similarity on the query embedding plus Postgres full-text search,
   * fused by reciprocal rank fusion. Nothing here reads the query's words: deciding whether a result
   * answers the question is the Decisions model's job (see relevance-judge.js).
   */
  async search(query, limit = 10) {
    const startTime = Date.now()

    try {
      const results = await this.hybridSearch(query, limit)
      const responseTime = Date.now() - startTime
      // Analytics only (logSearchQuery never throws): don't hold the results on the insert.
      void this.logSearchQuery(query, results.length, responseTime)
      return results.slice(0, limit)
    } catch (error) {
      logger.error('Error in search:', error)
      return []
    }
  }

  /** Nearest neighbours of the query embedding across posts, comments and chunks. */
  async vectorSearch(query, limit = 10) {
    const candidateLimit = Math.max(limit, 80)
    const queryEmbedding = await this.generateEmbedding(String(query || '').trim())
    if (!queryEmbedding) {
      logger.warn('Skipping vector search because the query embedding is unavailable')
      return []
    }

    const rows = await this.runVectorSearchWithEmbedding(
      queryEmbedding,
      Math.ceil(candidateLimit * 0.5),
      Math.ceil(candidateLimit * 0.35),
      Math.ceil(candidateLimit * 0.15),
      candidateLimit
    )

    return rows.map(row => ({
      ...row,
      similarity: parseFloat(Math.max(0, Math.min(1, Number(row.similarity) || 0)).toFixed(3)),
    }))
  }

  /**
   * Postgres full-text search. The query is parsed only by Postgres' own text-search parser
   * (`websearch_to_tsquery` / `plainto_tsquery`, english config: tokenising, stemming and stop words
   * are the database's). `any_q` is the same parse with its lexemes OR-ed instead of AND-ed, so
   * documents matching some of the question's words are still candidates; `ts_rank_cd` orders them.
   */
  async textSearch(query, limit = 10) {
    const queryText = String(query || '').trim()
    if (!queryText) return []

    const textSearchSQL = `
      WITH input AS (
        SELECT
          websearch_to_tsquery('english', $1) AS all_q,
          NULLIF(replace(plainto_tsquery('english', $1)::text, ' & ', ' | '), '')::tsquery AS any_q
      ),
      post_results AS (
        SELECT
          'post'::text AS type,
          p.reddit_id::text AS reddit_id,
          ('post:' || p.id::text) AS source_key,
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
            ts_rank_cd(to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')), input.all_q, 32),
            COALESCE(ts_rank_cd(to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')), input.any_q, 32), 0)
          )::double precision AS text_rank
        FROM reddit_posts p
        CROSS JOIN input
        WHERE
          to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')) @@ input.all_q
          OR to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.content, '')) @@ input.any_q
        ORDER BY text_rank DESC, p.score DESC
        LIMIT $2
      ),
      comment_results AS (
        SELECT
          'comment'::text AS type,
          c.reddit_id::text AS reddit_id,
          ('comment:' || c.id::text) AS source_key,
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
            ts_rank_cd(to_tsvector('english', COALESCE(c.content, '')), input.all_q, 32),
            COALESCE(ts_rank_cd(to_tsvector('english', COALESCE(c.content, '')), input.any_q, 32), 0)
          )::double precision AS text_rank
        FROM reddit_comments c
        CROSS JOIN input
        WHERE
          to_tsvector('english', COALESCE(c.content, '')) @@ input.all_q
          OR to_tsvector('english', COALESCE(c.content, '')) @@ input.any_q
        ORDER BY text_rank DESC, c.score DESC
        LIMIT $2
      ),
      chunk_results AS (
        SELECT
          'chunk'::text AS type,
          kc.source_id::text AS reddit_id,
          (kc.source_type || ':' || kc.source_id::text) AS source_key,
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
            ts_rank_cd(to_tsvector('english', COALESCE(kc.chunk_text, '')), input.all_q, 32),
            COALESCE(ts_rank_cd(to_tsvector('english', COALESCE(kc.chunk_text, '')), input.any_q, 32), 0)
          )::double precision AS text_rank
        FROM knowledge_chunks kc
        CROSS JOIN input
        WHERE
          to_tsvector('english', COALESCE(kc.chunk_text, '')) @@ input.all_q
          OR to_tsvector('english', COALESCE(kc.chunk_text, '')) @@ input.any_q
        ORDER BY text_rank DESC
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
      const result = await this.pool.query(textSearchSQL, [queryText, limit])
      return result.rows.map(row => ({
        ...row,
        textRank: Math.max(0, Number(row.text_rank) || 0),
      }))
    } catch (error) {
      logger.error(`Full-text search failed: ${this.formatErrorForLog(error)}`)
      return []
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

  /** Vector + full-text candidates, fused by RRF, de-duplicated, then type-balanced. */
  async hybridSearch(query, limit = 10) {
    const candidateLimit = Math.max(limit * 5, 50)

    const [vectorResults, textResults] = await Promise.all([
      this.vectorSearch(query, candidateLimit).catch(error => {
        logger.warn(`vector search failed: ${this.formatErrorForLog(error)}`)
        return []
      }),
      this.textSearch(query, candidateLimit).catch(error => {
        logger.warn(`full-text search failed: ${this.formatErrorForLog(error)}`)
        return []
      }),
    ])

    logger.info(
      `vector search found ${vectorResults.length} results, full-text search found ${textResults.length}`
    )

    const fusedResults = this.fuseResultsByRrf(
      [
        { strategy: 'vector', results: vectorResults },
        { strategy: 'text', results: textResults },
      ],
      candidateLimit
    )
    if (fusedResults.length === 0) return []

    const uniqueResults = this.removeDuplicates(fusedResults)
    logger.info(`After deduplication: ${uniqueResults.length} unique results`)

    const targetLimit = Math.max(limit * 4, 40)
    return this.diversifyByType(uniqueResults, targetLimit)
  }

  /**
   * Reciprocal rank fusion (k = 60, equal weights) over ranked result lists. Each result keeps the
   * best cosine `similarity` it got from the vector list (0 when only full-text found it) and the
   * best `textRank`. Ordered by fused score, then similarity.
   */
  fuseResultsByRrf(strategyBuckets, candidateLimit) {
    const merged = new Map()
    const rrfK = 60

    for (const bucket of strategyBuckets) {
      const strategy = bucket?.strategy || 'unknown'
      const results = Array.isArray(bucket?.results) ? bucket.results : []

      results.forEach((result, index) => {
        const key = `${result.type}:${result.reddit_id}`
        const existing = merged.get(key)
        const rrfContribution = 1 / (rrfK + index + 1)
        const similarity =
          strategy === 'vector' ? Math.max(0, Math.min(1, Number(result.similarity) || 0)) : 0
        const textRank = Math.max(0, Number(result.textRank ?? result.text_rank) || 0)

        if (!existing) {
          merged.set(key, {
            ...result,
            similarity,
            textRank,
            rrfScore: rrfContribution,
            sourceStrategies: [strategy],
          })
          return
        }

        existing.rrfScore += rrfContribution
        existing.similarity = Math.max(existing.similarity, similarity)
        existing.textRank = Math.max(existing.textRank, textRank)
        if (!existing.source_key && result.source_key) existing.source_key = result.source_key
        if (!existing.sourceStrategies.includes(strategy)) {
          existing.sourceStrategies.push(strategy)
        }
      })
    }

    return Array.from(merged.values())
      .sort((a, b) => {
        const rrfDelta = b.rrfScore - a.rrfScore
        if (Math.abs(rrfDelta) > 1e-12) return rrfDelta
        return b.similarity - a.similarity
      })
      .slice(0, candidateLimit)
  }

  /**
   * Structural de-duplication, preserving order: one entry per (type, reddit_id); chunks dropped
   * when the post/comment they were cut from is itself a candidate (same `source_key`); and
   * byte-identical title+content (crossposts) kept once.
   */
  removeDuplicates(results) {
    const list = Array.isArray(results) ? results : []
    const parentSourceKeys = new Set(
      list.filter(result => result.type !== 'chunk' && result.source_key).map(r => r.source_key)
    )
    const seenIds = new Set()
    const seenText = new Set()

    return list.filter(result => {
      const idKey = `${result.type}:${result.reddit_id}`
      if (seenIds.has(idKey)) return false
      if (result.type === 'chunk' && result.source_key && parentSourceKeys.has(result.source_key)) {
        return false
      }

      const title = String(result.title || '')
      const content = String(result.content || '')
      const textKey = title || content ? `${title}\u0000${content}` : null
      if (textKey && seenText.has(textKey)) return false

      seenIds.add(idKey)
      if (textKey) seenText.add(textKey)
      return true
    })
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
          reddit_id, ('post:' || id::text) AS source_key,
          subreddit, title, content, author,
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
          reddit_id, ('comment:' || id::text) AS source_key,
          subreddit, content AS title, content,
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
          source_id::text AS reddit_id, (source_type || ':' || source_id::text) AS source_key,
          subreddit,
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
