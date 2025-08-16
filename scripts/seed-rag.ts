#!/usr/bin/env ts-node
/**
 * scripts/seed-rag.ts
 *
 * Splits your combined context + VIT comprehensive KB into ~800-token chunks,
 * then upserts embeddings into PostgreSQL/pgvector.
 *
 * Usage:
 *   ts-node scripts/seed-rag.ts                   # normal seed (append)
 *   ts-node scripts/seed-rag.ts --fresh           # clear vit_rag_chunks and reseed
 *   ts-node scripts/seed-rag.ts --chunk 400       # custom chunk size (default 200)
 *   ts-node scripts/seed-rag.ts --custom "your custom text"   # add a custom chunk
 */

import { getContextForAIPrompt } from '../lib/data/context-integration'
import { VIT_COMPREHENSIVE_KNOWLEDGE } from '../lib/knowledge-base'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { encoding_for_model } from 'tiktoken'
import 'dotenv/config'
import pg from 'pg'
import { randomUUID } from 'crypto'
import { rateLimitedAI } from '../lib/rate-limited-ai'
const { Pool } = pg

async function promptForChunkSize(defaultSize: number): Promise<number> {
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    rl.question(`Enter chunk size (tokens) [default: ${defaultSize}]: `, answer => {
      rl.close()
      const parsed = parseInt(answer, 10)
      resolve(isNaN(parsed) ? defaultSize : parsed)
    })
  })
}

async function main() {
  const fresh = process.argv.includes('--fresh')
  const chunkArgIndex = process.argv.findIndex(arg => arg === '--chunk')
  const customArgIndex = process.argv.findIndex(arg => arg === '--custom')
  let chunkSize = 200
  let customText: string | null = null

  if (chunkArgIndex !== -1 && process.argv[chunkArgIndex + 1]) {
    const parsed = parseInt(process.argv[chunkArgIndex + 1], 10)
    if (!isNaN(parsed)) chunkSize = parsed
  } else {
    // Prompt user for chunk size if not provided
    chunkSize = await promptForChunkSize(chunkSize)
  }

  if (customArgIndex !== -1 && process.argv[customArgIndex + 1]) {
    customText = process.argv[customArgIndex + 1]
  }

  if (!process.env.DATABASE_URL2) {
    console.error('ERROR: DATABASE_URL2 env var is required')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL2,
    max: 4,
  })

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vit_rag_chunks (
      id uuid PRIMARY KEY,
      chunk text NOT NULL,
      metadata jsonb,
      embedding vector(768) NOT NULL
    );
  `)

  if (fresh) {
    console.log('Clearing vit_rag_chunks table...')
    await pool.query('TRUNCATE vit_rag_chunks;')
  }

  // Insert custom chunk if provided
  if (customText) {
    console.log('Inserting custom chunk:', customText)
    try {
      const { embedding } = await rateLimitedAI.google.embed({
        model: { modelId: 'text-embedding-004' },
        value: customText,
      })
      const id = randomUUID()
      const metadata = {
        source: 'custom',
        note: 'Inserted via --custom param',
        length: customText.length,
      }
      await pool.query(
        `
        INSERT INTO vit_rag_chunks (id, chunk, metadata, embedding)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (id) DO NOTHING
      `,
        [id, customText.trim(), JSON.stringify(metadata), '[' + embedding.join(',') + ']']
      )
      console.log('✅ Custom chunk inserted.')
    } catch (err) {
      console.error('Error inserting custom chunk:', err)
    }
  }

  const raw =
    getContextForAIPrompt({ includeAll: true, maxLength: 100000 }) +
    '\n\n' +
    VIT_COMPREHENSIVE_KNOWLEDGE

  const enc = await encoding_for_model('gpt-3.5-turbo')

  const splitter = new RecursiveCharacterTextSplitter({
    separators: ['\n## ', '\n# ', '\n\n', '\n', ' ', ''],
    chunkSize,
    chunkOverlap: 40,
    lengthFunction: text => enc.encode(text).length,
  })

  const docs = await splitter.createDocuments([raw])
  console.log(`Prepared ${docs.length} chunks (chunk size: ${chunkSize}); generating embeddings…`)

  for (const [idx, doc] of docs.entries()) {
    try {
      const { embedding } = await rateLimitedAI.google.embed({
        model: { modelId: 'text-embedding-004' },
        value: doc.pageContent,
      })

      const id = randomUUID()
      const metadata = {
        source: 'seed-rag-ts',
        idx,
        length: doc.pageContent.length,
      }

      await pool.query(
        `
        INSERT INTO vit_rag_chunks (id, chunk, metadata, embedding)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (id) DO NOTHING
      `,
        [id, doc.pageContent.trim(), JSON.stringify(metadata), '[' + embedding.join(',') + ']']
      )
    } catch (err) {
      console.error(`Error on chunk ${idx}:`, err)
    }
  }

  await pool.end()
  console.log('✅ Seeding completed.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
