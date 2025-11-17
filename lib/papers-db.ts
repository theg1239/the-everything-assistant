import pg from 'pg'
import { randomUUID } from 'crypto'

const { Pool } = pg

let pool: pg.Pool | null = null

function getPool() {
  if (!process.env.DATABASE_URL2) throw new Error('DATABASE_URL2 not set')
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL2, max: 5 })
  }
  return pool
}

export async function ensurePaperSchema() {
  const db = getPool()
  await db.query(`
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS past_papers (
      id uuid PRIMARY KEY,
      course_code text NOT NULL,
      exam_type text,
      year text,
      title text NOT NULL,
      source text,
      url text UNIQUE,
      content_hash text,
      extracted_questions jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS past_paper_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_id uuid REFERENCES past_papers(id) ON DELETE CASCADE,
      chunk_index int,
      text text,
      embedding vector(3072) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS past_paper_question_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_id uuid REFERENCES past_papers(id) ON DELETE CASCADE,
      question_index int,
      question text,
      embedding vector(3072)
    );
    CREATE TABLE IF NOT EXISTS paper_indexes (
      id uuid PRIMARY KEY,
      course_code text,
      exam_type text,
      year text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS paper_index_papers (
      index_id uuid REFERENCES paper_indexes(id) ON DELETE CASCADE,
      paper_id uuid REFERENCES past_papers(id) ON DELETE CASCADE,
      PRIMARY KEY(index_id, paper_id)
    );
    -- Ensure defaults even if table existed previously
    ALTER TABLE past_paper_chunks ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE past_paper_question_embeddings ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `)
}

export interface DBPaperMeta {
  id: string
  course_code: string
  exam_type: string | null
  year: string | null
  title: string
  url: string | null
  extracted_questions: string[] | null
  content_hash: string | null
}

export async function findPaperByUrl(url: string) {
  const db = getPool()
  const r = await db.query('SELECT * FROM past_papers WHERE url=$1', [url])
  return r.rows[0] as DBPaperMeta | undefined
}

export async function insertPaper(meta: {
  courseCode: string
  examType?: string
  year?: string
  title: string
  source?: string
  url: string
  contentHash?: string
  extractedQuestions: string[]
}) {
  const db = getPool()
  const id = randomUUID()
  await db.query(
    `INSERT INTO past_papers (id, course_code, exam_type, year, title, source, url, content_hash, extracted_questions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (url) DO NOTHING`,
    [
      id,
      meta.courseCode,
      meta.examType || null,
      meta.year || null,
      meta.title,
      meta.source || null,
      meta.url,
      meta.contentHash || null,
      JSON.stringify(meta.extractedQuestions || []),
    ]
  )
  const row = await findPaperByUrl(meta.url)
  return row?.id || id
}

export async function upsertChunks(
  paperId: string,
  chunks: { index: number; text: string; embedding: number[] }[]
) {
  if (!chunks.length) return
  const db = getPool()
  const values: any[] = []
  const params: string[] = []
  let i = 1
  for (const c of chunks) {
    values.push(randomUUID(), paperId, c.index, c.text, '[' + c.embedding.join(',') + ']')
    params.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4})`)
    i += 5
  }
  await db.query(
    `INSERT INTO past_paper_chunks (id, paper_id, chunk_index, text, embedding)
     VALUES ${params.join(',')}
     ON CONFLICT (id) DO NOTHING`,
    values
  )
}

export async function upsertQuestionEmbeddings(
  paperId: string,
  questions: { index: number; question: string; embedding: number[] }[]
) {
  if (!questions.length) return
  const db = getPool()
  const values: any[] = []
  const params: string[] = []
  let i = 1
  for (const q of questions) {
    values.push(randomUUID(), paperId, q.index, q.question, '[' + q.embedding.join(',') + ']')
    params.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4})`)
    i += 5
  }
  await db.query(
    `INSERT INTO past_paper_question_embeddings (id, paper_id, question_index, question, embedding)
     VALUES ${params.join(',')}
     ON CONFLICT (id) DO NOTHING`,
    values
  )
}

export async function createIndexRecord(courseCode: string, examType?: string, year?: string) {
  const db = getPool()
  const id = randomUUID()
  await db.query(
    `INSERT INTO paper_indexes (id, course_code, exam_type, year) VALUES ($1,$2,$3,$4)`,
    [id, courseCode, examType || null, year || null]
  )
  return id
}

export async function linkIndexPapers(indexId: string, paperIds: string[]) {
  if (!paperIds.length) return
  const db = getPool()
  const values: any[] = []
  const params: string[] = []
  let i = 1
  for (const pid of paperIds) {
    values.push(indexId, pid)
    params.push(`($${i}, $${i + 1})`)
    i += 2
  }
  await db.query(
    `INSERT INTO paper_index_papers (index_id, paper_id) VALUES ${params.join(',')} ON CONFLICT DO NOTHING`,
    values
  )
}

export async function getCoursePapers(courseCode: string, examType?: string, year?: string) {
  const db = getPool()
  const r = await db.query(
    `SELECT * FROM past_papers WHERE course_code=$1
      AND ($2::text IS NULL OR exam_type=$2)
      AND ($3::text IS NULL OR year=$3)`,
    [courseCode, examType || null, year || null]
  )
  return r.rows as DBPaperMeta[]
}

export async function loadChunksAndQuestions(paperIds: string[]) {
  if (!paperIds.length) return { chunks: [], questions: [] }
  const db = getPool()
  const r1 = await db.query(
    `SELECT paper_id, chunk_index, text, embedding FROM past_paper_chunks WHERE paper_id = ANY($1::uuid[])`,
    [paperIds]
  )
  const r2 = await db.query(
    `SELECT paper_id, question_index, question, embedding FROM past_paper_question_embeddings WHERE paper_id = ANY($1::uuid[])`,
    [paperIds]
  )
  return { chunks: r1.rows, questions: r2.rows }
}

export async function semanticRankQuestion(
  courseCode: string,
  qEmbedding: number[],
  limit = 10,
  examType?: string,
  year?: string
) {
  const db = getPool()
  const r = await db.query(
    `SELECT p.id as paper_id, p.title, p.exam_type, p.year,
            MAX(1 - (c.embedding <=> $1)) as chunk_score
       FROM past_paper_chunks c
       JOIN past_papers p ON p.id = c.paper_id
      WHERE p.course_code=$2
        AND ($3::text IS NULL OR p.exam_type=$3)
        AND ($4::text IS NULL OR p.year=$4)
      GROUP BY p.id
      ORDER BY MAX(c.embedding <=> $1) ASC
      LIMIT $5`,
    ['[' + qEmbedding.join(',') + ']', courseCode, examType || null, year || null, limit]
  )
  return r.rows
}

export async function getIndexMetaById(indexId: string) {
  const db = getPool()
  const r = await db.query(
    `SELECT id, course_code, exam_type, year, created_at FROM paper_indexes WHERE id=$1`,
    [indexId]
  )
  return r.rows[0] as
    | {
        id: string
        course_code: string
        exam_type: string | null
        year: string | null
        created_at: string
      }
    | undefined
}

export async function getIndexPaperIds(indexId: string) {
  const db = getPool()
  const r = await db.query(`SELECT paper_id FROM paper_index_papers WHERE index_id=$1`, [indexId])
  return r.rows.map(row => row.paper_id as string)
}

export async function getPapersByIds(ids: string[]) {
  if (!ids.length) return []
  const db = getPool()
  const r = await db.query(
    `SELECT id, course_code, exam_type, year, title, url, extracted_questions, content_hash FROM past_papers WHERE id = ANY($1::uuid[])`,
    [ids]
  )
  return r.rows as DBPaperMeta[]
}

export async function questionEmbeddingScores(
  courseCode: string,
  qEmbedding: number[],
  examType?: string,
  year?: string
) {
  const db = getPool()
  const r = await db.query(
    `SELECT p.id as paper_id, MAX(1 - (qe.embedding <=> $1)) as question_score
       FROM past_paper_question_embeddings qe
       JOIN past_papers p ON p.id = qe.paper_id
      WHERE p.course_code=$2
        AND ($3::text IS NULL OR p.exam_type=$3)
        AND ($4::text IS NULL OR p.year=$4)
      GROUP BY p.id`,
    ['[' + qEmbedding.join(',') + ']', courseCode, examType || null, year || null]
  )
  return r.rows
}
