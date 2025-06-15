require('dotenv').config();

const { Pool } = require('pg');
const { embed } = require('ai');
const { google } = require('@ai-sdk/google');
const logger = require('../utils/logger');

class KnowledgeBase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    this.embeddingModel = google.embedding('text-embedding-004');
    this.embeddingDim = 768;
    this.similarityThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.8;
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 4000;
  }

  async initialize() {
    try {
      await this.createTables();
      await this.migrateVectorDimensions();
      await this.createIndexes();
      logger.info('Knowledge base initialized successfully');
    } catch (error) {
      logger.error('Error initializing knowledge base:', error);
      throw error;
    }
  }

  async migrateVectorDimensions() {
    try {
      const checkDimensionsSQL = `
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name IN ('reddit_posts', 'reddit_comments', 'knowledge_chunks') 
          AND column_name = 'embedding'
          AND data_type LIKE '%vector%'
      `;
      
      const result = await this.pool.query(checkDimensionsSQL);
      
      if (result.rows.length > 0) {
        logger.info('Checking vector dimensions...');
        try {
          await this.pool.query('SELECT embedding FROM reddit_posts LIMIT 1');
        } catch (error) {
          if (error.message.includes('expected') && error.message.includes('dimensions')) {
            logger.info('Migrating vector columns to ensure 768 dimensions...');
            
            const migrationSQL = `
              -- Drop indexes first
              DROP INDEX IF EXISTS reddit_posts_embedding_idx;
              DROP INDEX IF EXISTS reddit_comments_embedding_idx;
              DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;
              
              -- Drop and recreate embedding columns with 768 dimensions
              ALTER TABLE reddit_posts DROP COLUMN IF EXISTS embedding;
              ALTER TABLE reddit_posts ADD COLUMN embedding vector(768);
              
              ALTER TABLE reddit_comments DROP COLUMN IF EXISTS embedding;
              ALTER TABLE reddit_comments ADD COLUMN embedding vector(768);
              
              ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS embedding;
              ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(768);
            `;
            
            await this.pool.query(migrationSQL);
            logger.info('Vector dimension migration completed successfully');
          }
        }
      }
    } catch (error) {
      logger.error('Error during vector dimension migration:', error);
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
        extracted_text TEXT,        tags TEXT[],
        embedding vector(768),
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
        embedding vector(768),
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
        embedding vector(768),
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
    `;
    await this.pool.query(createTablesSQL);
  }  async createIndexes() {
    const indexesSQL = `
      -- Vector similarity indexes (using IVFFlat for 768 dimensions)
      CREATE INDEX IF NOT EXISTS idx_posts_embedding
        ON reddit_posts USING ivfflat (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_comments_embedding
        ON reddit_comments USING ivfflat (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding
        ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);
      
      -- Regular indexes
      CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON reddit_posts(subreddit);
      CREATE INDEX IF NOT EXISTS idx_posts_score ON reddit_posts(score);
      CREATE INDEX IF NOT EXISTS idx_posts_created ON reddit_posts(created_utc);
      CREATE INDEX IF NOT EXISTS idx_posts_tags ON reddit_posts USING GIN(tags);
      
      CREATE INDEX IF NOT EXISTS idx_comments_subreddit ON reddit_comments(subreddit);
      CREATE INDEX IF NOT EXISTS idx_comments_score ON reddit_comments(score);
      CREATE INDEX IF NOT EXISTS idx_comments_post ON reddit_comments(post_reddit_id);
      
      CREATE INDEX IF NOT EXISTS idx_chunks_subreddit ON knowledge_chunks(subreddit);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON knowledge_chunks(source_type, source_id);
    `;
    await this.pool.query(indexesSQL);
  }

  async storePost(postData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');      const textContent = `${postData.title} ${postData.content} ${postData.extracted_text}`.trim();
      const embedding = await this.generateEmbedding(textContent);
      
      if (!Array.isArray(embedding)) {
        throw new Error(`Invalid embedding: expected array, got ${typeof embedding}`);
      }
      
      if (embedding.length !== this.embeddingDim) {
        logger.error(`Embedding dimension mismatch for post ${postData.reddit_id}: got ${embedding.length}, expected ${this.embeddingDim}`);
        throw new Error(`Invalid embedding dimension: got ${embedding.length}, expected ${this.embeddingDim}. This usually means the database vector columns need to be migrated.`);
      }
      
      logger.debug(`Generated embedding with ${embedding.length} dimensions for post ${postData.reddit_id}`);

      const insertPostSQL = `
        INSERT INTO reddit_posts (
          reddit_id, subreddit, title, content, author, created_utc,
          upvotes, downvotes, score, num_comments, url, permalink,
          is_video, post_type, images, extracted_text, tags, embedding
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18
        )
        ON CONFLICT (reddit_id) DO UPDATE SET
          upvotes     = EXCLUDED.upvotes,
          downvotes   = EXCLUDED.downvotes,
          score       = EXCLUDED.score,
          num_comments= EXCLUDED.num_comments,
          updated_at  = CURRENT_TIMESTAMP
        RETURNING id
      `;
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
        postData.extracted_text,
        postData.tags,
        `[${embedding.join(',')}]`
      ]);

      const postId = result.rows[0].id;
      await this.createKnowledgeChunks(client, textContent, 'post', postId, postData.subreddit);
      await this.updateSubredditStats(client, postData.subreddit);

      await client.query('COMMIT');
      logger.info(`Stored post ${postData.reddit_id} in knowledge base`);
      return postId;    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.message && error.message.includes('expected 768 dimensions')) {
        logger.error(`Vector dimension error for post ${postData.reddit_id}: Database expects 768 dimensions but code is using ${this.embeddingDim}. Run database migration to fix this.`);
        throw new Error(`Database vector dimension mismatch: expected 768, got ${this.embeddingDim}. Please run the migration to update database schema.`);
      }
      
      logger.error(`Error storing post ${postData.reddit_id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
  async storeComment(commentData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      if (!commentData.reddit_id) {
        throw new Error('Comment reddit_id is required');
      }
      if (!commentData.content || !commentData.content.trim()) {
        throw new Error('Comment content is required');
      }
      
      const embedding = await this.generateEmbedding(commentData.content);
      if (!Array.isArray(embedding) || embedding.length !== this.embeddingDim) {
        throw new Error(`Invalid embedding dimension: got ${embedding.length}, expected ${this.embeddingDim}`);
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
          upvotes     = EXCLUDED.upvotes,
          downvotes   = EXCLUDED.downvotes,
          score       = EXCLUDED.score
        RETURNING id
      `;
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
        `[${embedding.join(',')}]`
      ]);

      const commentId = result.rows[0].id;
      if (commentData.content.length > 200) {
        await this.createKnowledgeChunks(
          client,
          commentData.content,
          'comment',
          commentId,
          commentData.subreddit
        );
      }
      await client.query('COMMIT');
      return commentId;    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.message && error.message.includes('null value in column "reddit_id"')) {
        logger.error(`Comment reddit_id validation failed: ${JSON.stringify(commentData)}`);
        throw new Error(`Comment reddit_id cannot be null. Comment data: ${JSON.stringify(commentData)}`);
      }
      
      logger.error(`Error storing comment ${commentData.reddit_id || 'unknown'}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createKnowledgeChunks(client, text, sourceType, sourceId, subreddit) {
    if (!text || text.length < 100) return;
    const chunks = this.splitTextIntoChunks(text);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.generateEmbedding(chunk);
      if (!Array.isArray(embedding) || embedding.length !== this.embeddingDim) continue;

      const insertChunkSQL = `
        INSERT INTO knowledge_chunks (
          source_type, source_id, chunk_text, chunk_index, subreddit, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      await client.query(insertChunkSQL, [
        sourceType,
        sourceId,
        chunk,
        i,
        subreddit,
        `[${embedding.join(',')}]`,
        JSON.stringify({
          length: chunk.length,
          words: chunk.split(' ').length
        })
      ]);
    }
  }

  splitTextIntoChunks(text, maxChunkSize = 500, overlap = 50) {
    const words = text.split(' ');
    const chunks = [];
    for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
      const chunk = words.slice(i, i + maxChunkSize).join(' ');
      if (chunk.trim()) chunks.push(chunk.trim());
    }
    return chunks;
  }

  async generateEmbedding(text) {
    if (!text || !text.trim()) {
      return new Array(this.embeddingDim).fill(0);
    }
    try {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text.substring(0, this.maxContextLength)
      });
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      return new Array(this.embeddingDim).fill(0);
    }
  }

  async search(query, limit = 10) {
    const startTime = Date.now();
    const queryEmbedding = await this.generateEmbedding(query);
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== this.embeddingDim) {
      throw new Error(`Invalid search embedding dimension: got ${queryEmbedding.length}`);
    }
    const searchSQL = `
      WITH post_results AS (
        SELECT
          'post' AS type,
          reddit_id, subreddit, title, content, author,
          score, upvotes, created_utc, url, tags,
          1 - (embedding <=> $1) AS similarity
        FROM reddit_posts
        WHERE embedding <=> $1 < $2
        ORDER BY similarity DESC
        LIMIT $3
      ),
      comment_results AS (
        SELECT
          'comment' AS type,
          reddit_id, subreddit, content AS title, content,
          author, score, upvotes, created_utc, NULL AS url, tags,
          1 - (embedding <=> $1) AS similarity
        FROM reddit_comments
        WHERE embedding <=> $1 < $2
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
          NULL AS url, ARRAY[]::text[] AS tags,
          1 - (embedding <=> $1) AS similarity
        FROM knowledge_chunks
        WHERE embedding <=> $1 < $2
        ORDER BY similarity DESC
        LIMIT $3
      )
      SELECT * FROM (
        SELECT * FROM post_results
        UNION ALL
        SELECT * FROM comment_results
        UNION ALL
        SELECT * FROM chunk_results
      ) AS combined
      ORDER BY similarity DESC
      LIMIT $3
    `;
    const result = await this.pool.query(searchSQL, [
      `[${queryEmbedding.join(',')}]`,
      1 - this.similarityThreshold,
      limit
    ]);
    const responseTime = Date.now() - startTime;
    await this.logSearchQuery(query, result.rows.length, responseTime);
    return result.rows.map(r => ({
      ...r,
      similarity: parseFloat(r.similarity.toFixed(3))
    }));
  }

  async logSearchQuery(query, resultsCount, responseTimeMs, userIp = null) {
    try {
      const logSQL = `
        INSERT INTO search_queries (
          query, results_count, response_time_ms, user_ip
        ) VALUES ($1, $2, $3, $4)
      `;
      await this.pool.query(logSQL, [query, resultsCount, responseTimeMs, userIp]);
    } catch (error) {
      logger.error('Error logging search query:', error);
    }
  }

  async getPostByRedditId(redditId) {
    const res = await this.pool.query(
      'SELECT * FROM reddit_posts WHERE reddit_id = $1',
      [redditId]
    );
    return res.rows[0];
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
    `;
    await this.pool.query(updateSQL, [
      redditId,
      stats.upvotes,
      stats.downvotes,
      stats.score,
      stats.num_comments
    ]);
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
    `;
    await client.query(statsSQL, [subreddit, subreddit]);
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
    `;
    const res = await this.pool.query(statsSQL);
    return res.rows[0];
  }

  async getSubredditStats() {
    const res = await this.pool.query(`
      SELECT *
      FROM subreddit_stats
      WHERE active = true
      ORDER BY total_posts DESC
    `);
    return res.rows;
  }

  async getTopPosts(subreddit = null, limit = 10) {
    let sql = `
      SELECT reddit_id, subreddit, title, score, upvotes, num_comments, created_utc
      FROM reddit_posts
    `;
    const params = [];
    if (subreddit) {
      sql += ' WHERE subreddit = $1';
      params.push(subreddit);
    }
    sql += ` ORDER BY score DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await this.pool.query(sql, params);
    return res.rows;
  }

  async cleanup() {
    await this.pool.end();
  }
}

module.exports = KnowledgeBase;
