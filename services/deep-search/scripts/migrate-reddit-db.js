#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const { Pool } = require('pg')

const SOURCE_DB_URL = process.env.DATABASE_URL
const TARGET_DB_URL = process.env.REDDIT_DATABASE || process.env.DATABASE_URL

if (!SOURCE_DB_URL) {
  throw new Error('DATABASE_URL is required (source Cockroach DB)')
}

if (!TARGET_DB_URL) {
  throw new Error('REDDIT_DATABASE (or DATABASE_URL fallback) is required for target DB')
}

if (SOURCE_DB_URL === TARGET_DB_URL) {
  throw new Error('Source and target DB URLs are identical. Aborting migration.')
}

const BATCH_SIZE = 250

const maskDbUrl = value => {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.hostname}:${url.port || 'default'}/${url.pathname.replace('/', '')}`
  } catch {
    return '<invalid-url>'
  }
}

const parseMaybeJson = value => {
  if (value == null) return null
  if (typeof value === 'object') return value
  const text = String(value).trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') {
      try {
        return JSON.parse(parsed)
      } catch {
        return parsed
      }
    }
    return parsed
  } catch {
    return null
  }
}

const toJsonbParam = value => {
  const parsed = parseMaybeJson(value)
  if (parsed == null) return null
  return JSON.stringify(parsed)
}

const normalizeTextArray = value => {
  if (Array.isArray(value)) return value.map(v => String(v))
  if (value == null) return []
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value)
    if (Array.isArray(parsed)) return parsed.map(v => String(v))
    const cleaned = value.trim()
    if (!cleaned) return []
    return [cleaned]
  }
  return [String(value)]
}

async function ensureTargetSchema(target) {
  const sql = `
    CREATE EXTENSION IF NOT EXISTS vector;

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
      video JSONB,
      extracted_text TEXT,
      tags TEXT[],
      embedding vector(768),
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
      is_submitter BOOLEAN DEFAULT FALSE,
      tags TEXT[],
      embedding vector(768),
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id SERIAL PRIMARY KEY,
      source_type VARCHAR(20) NOT NULL,
      source_id BIGINT NOT NULL,
      chunk_text TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      subreddit VARCHAR(100) NOT NULL,
      relevance_score FLOAT DEFAULT 0,
      embedding vector(768),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE knowledge_chunks
      ALTER COLUMN source_id TYPE BIGINT USING source_id::BIGINT;

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

    CREATE TABLE IF NOT EXISTS search_queries (
      id SERIAL PRIMARY KEY,
      query TEXT NOT NULL,
      results_count INTEGER,
      response_time_ms INTEGER,
      user_ip VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `
  await target.query(sql)
}

async function migratePosts(source, target) {
  console.log('Migrating reddit_posts...')
  let migrated = 0
  let offset = 0

  while (true) {
    const { rows } = await source.query(
      `
      SELECT
        reddit_id, subreddit, title, content, author, created_utc,
        upvotes, downvotes, score, num_comments, url, permalink,
        is_video, post_type, images, video, extracted_text, tags,
        embedding::text AS embedding_text
      FROM reddit_posts
      ORDER BY id
      LIMIT $1 OFFSET $2
      `,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    for (const row of rows) {
      await target.query(
        `
        INSERT INTO reddit_posts (
          reddit_id, subreddit, title, content, author, created_utc,
          upvotes, downvotes, score, num_comments, url, permalink,
          is_video, post_type, images, video, extracted_text, tags, embedding
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15::jsonb, $16::jsonb, $17, $18, $19::vector
        )
        ON CONFLICT (reddit_id) DO UPDATE SET
          subreddit = EXCLUDED.subreddit,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          author = EXCLUDED.author,
          created_utc = EXCLUDED.created_utc,
          upvotes = EXCLUDED.upvotes,
          downvotes = EXCLUDED.downvotes,
          score = EXCLUDED.score,
          num_comments = EXCLUDED.num_comments,
          url = EXCLUDED.url,
          permalink = EXCLUDED.permalink,
          is_video = EXCLUDED.is_video,
          post_type = EXCLUDED.post_type,
          images = EXCLUDED.images,
          video = EXCLUDED.video,
          extracted_text = EXCLUDED.extracted_text,
          tags = EXCLUDED.tags,
          embedding = COALESCE(EXCLUDED.embedding, reddit_posts.embedding),
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          row.reddit_id,
          row.subreddit,
          row.title,
          row.content,
          row.author,
          row.created_utc,
          row.upvotes,
          row.downvotes,
          row.score,
          row.num_comments,
          row.url,
          row.permalink,
          row.is_video,
          row.post_type,
          toJsonbParam(row.images),
          toJsonbParam(row.video),
          row.extracted_text,
          normalizeTextArray(row.tags),
          row.embedding_text,
        ]
      )
      migrated++
    }

    offset += rows.length
    console.log(`  migrated ${migrated} posts...`)
  }

  return migrated
}

async function migrateComments(source, target) {
  console.log('Migrating reddit_comments...')
  let migrated = 0
  let offset = 0

  while (true) {
    const { rows } = await source.query(
      `
      SELECT
        reddit_id, post_reddit_id, parent_comment_id, subreddit, author,
        content, created_utc, upvotes, downvotes, score, depth,
        is_submitter, tags, embedding::text AS embedding_text
      FROM reddit_comments
      ORDER BY id
      LIMIT $1 OFFSET $2
      `,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    for (const row of rows) {
      await target.query(
        `
        INSERT INTO reddit_comments (
          reddit_id, post_reddit_id, parent_comment_id, subreddit, author,
          content, created_utc, upvotes, downvotes, score, depth,
          is_submitter, tags, embedding
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14::vector
        )
        ON CONFLICT (reddit_id) DO UPDATE SET
          post_reddit_id = EXCLUDED.post_reddit_id,
          parent_comment_id = EXCLUDED.parent_comment_id,
          subreddit = EXCLUDED.subreddit,
          author = EXCLUDED.author,
          content = EXCLUDED.content,
          created_utc = EXCLUDED.created_utc,
          upvotes = EXCLUDED.upvotes,
          downvotes = EXCLUDED.downvotes,
          score = EXCLUDED.score,
          depth = EXCLUDED.depth,
          is_submitter = EXCLUDED.is_submitter,
          tags = EXCLUDED.tags,
          embedding = COALESCE(EXCLUDED.embedding, reddit_comments.embedding)
        `,
        [
          row.reddit_id,
          row.post_reddit_id,
          row.parent_comment_id,
          row.subreddit,
          row.author,
          row.content,
          row.created_utc,
          row.upvotes,
          row.downvotes,
          row.score,
          row.depth,
          row.is_submitter,
          row.tags,
          row.embedding_text,
        ]
      )
      migrated++
    }

    offset += rows.length
    console.log(`  migrated ${migrated} comments...`)
  }

  return migrated
}

async function migrateKnowledgeChunks(source, target) {
  console.log('Migrating knowledge_chunks...')
  let migrated = 0
  let offset = 0

  while (true) {
    const { rows } = await source.query(
      `
      SELECT
        source_type, source_id, chunk_text, chunk_index, subreddit,
        relevance_score, embedding::text AS embedding_text, metadata, created_at
      FROM knowledge_chunks
      ORDER BY id
      LIMIT $1 OFFSET $2
      `,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    for (const row of rows) {
      const insertResult = await target.query(
        `
        INSERT INTO knowledge_chunks (
          source_type, source_id, chunk_text, chunk_index, subreddit,
          relevance_score, embedding, metadata, created_at
        )
        SELECT
          $1::varchar(20), $2::bigint, $3::text, $4::integer, $5::varchar(100),
          $6::double precision, $7::vector, $8::jsonb, $9::timestamp
        WHERE NOT EXISTS (
          SELECT 1 FROM knowledge_chunks
          WHERE source_type = $1::varchar(20)
            AND source_id = $2::bigint
            AND chunk_index = $4::integer
            AND chunk_text = $3::text
        )
        `,
        [
          row.source_type,
          row.source_id,
          row.chunk_text,
          row.chunk_index,
          row.subreddit,
          row.relevance_score,
          row.embedding_text,
          row.metadata,
          row.created_at,
        ]
      )

      if (insertResult.rowCount > 0) {
        migrated++
      }
    }

    offset += rows.length
    console.log(`  inserted ${migrated} new chunks...`)
  }

  return migrated
}

async function migrateSubredditStats(source, target) {
  console.log('Migrating subreddit_stats...')
  const { rows } = await source.query(
    `
    SELECT subreddit, total_posts, total_comments, avg_score, last_scraped, active, updated_at
    FROM subreddit_stats
    `
  )

  for (const row of rows) {
    await target.query(
      `
      INSERT INTO subreddit_stats (
        subreddit, total_posts, total_comments, avg_score, last_scraped, active, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (subreddit) DO UPDATE SET
        total_posts = EXCLUDED.total_posts,
        total_comments = EXCLUDED.total_comments,
        avg_score = EXCLUDED.avg_score,
        last_scraped = EXCLUDED.last_scraped,
        active = EXCLUDED.active,
        updated_at = EXCLUDED.updated_at
      `,
      [
        row.subreddit,
        row.total_posts,
        row.total_comments,
        row.avg_score,
        row.last_scraped,
        row.active,
        row.updated_at,
      ]
    )
  }

  return rows.length
}

async function migrateSearchQueries(source, target) {
  console.log('Migrating search_queries...')
  const { rows } = await source.query(
    `
    SELECT query, results_count, response_time_ms, user_ip, created_at
    FROM search_queries
    ORDER BY id
    `
  )

  let inserted = 0
  for (const row of rows) {
    await target.query(
      `
      INSERT INTO search_queries (query, results_count, response_time_ms, user_ip, created_at)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [row.query, row.results_count, row.response_time_ms, row.user_ip, row.created_at]
    )
    inserted++
  }

  return inserted
}

async function countRows(pool, tableName) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${tableName}`)
  return Number(rows[0].c)
}

async function main() {
  console.log('Source DB:', maskDbUrl(SOURCE_DB_URL))
  console.log('Target DB:', maskDbUrl(TARGET_DB_URL))

  const source = new Pool({ connectionString: SOURCE_DB_URL })
  const target = new Pool({ connectionString: TARGET_DB_URL })

  try {
    await ensureTargetSchema(target)

    const beforeCounts = {
      reddit_posts: await countRows(target, 'reddit_posts'),
      reddit_comments: await countRows(target, 'reddit_comments'),
      knowledge_chunks: await countRows(target, 'knowledge_chunks'),
      subreddit_stats: await countRows(target, 'subreddit_stats'),
      search_queries: await countRows(target, 'search_queries'),
    }
    console.log('Target row counts before migration:', beforeCounts)

    const moved = {
      reddit_posts: await migratePosts(source, target),
      reddit_comments: await migrateComments(source, target),
      knowledge_chunks: await migrateKnowledgeChunks(source, target),
      subreddit_stats: await migrateSubredditStats(source, target),
      search_queries: await migrateSearchQueries(source, target),
    }

    const afterCounts = {
      reddit_posts: await countRows(target, 'reddit_posts'),
      reddit_comments: await countRows(target, 'reddit_comments'),
      knowledge_chunks: await countRows(target, 'knowledge_chunks'),
      subreddit_stats: await countRows(target, 'subreddit_stats'),
      search_queries: await countRows(target, 'search_queries'),
    }

    console.log('Migrated rows (processed/inserted):', moved)
    console.log('Target row counts after migration:', afterCounts)
    console.log('Migration complete.')
  } finally {
    await source.end()
    await target.end()
  }
}

main().catch(error => {
  console.error('Migration failed:', error)
  process.exit(1)
})
