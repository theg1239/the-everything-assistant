#!/usr/bin/env ts-node


import { getContextForAIPrompt } from '../lib/data/context-integration'
import { VIT_COMPREHENSIVE_KNOWLEDGE } from '../lib/knowledge-base'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { encoding_for_model } from 'tiktoken'
import 'dotenv/config'
import pg from 'pg'
import { randomUUID } from 'crypto'
import { rateLimitedAI } from '../lib/rate-limited-ai'
import { modelIds } from '../lib/model-registry'
import fs from 'fs'
import path from 'path'
const { Pool } = pg

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const buffer = fs.readFileSync(pdfPath)
  const uint8Array = new Uint8Array(buffer)
  const parser = new PDFParse({ data: uint8Array })
  const result = await parser.getText()
  return result.text
}

async function findPDFFiles(dirOrFile: string): Promise<string[]> {
  const stat = fs.statSync(dirOrFile)
  if (stat.isFile() && dirOrFile.toLowerCase().endsWith('.pdf')) {
    return [dirOrFile]
  }
  if (stat.isDirectory()) {
    const files = fs.readdirSync(dirOrFile)
    const pdfFiles: string[] = []
    for (const file of files) {
      const fullPath = path.join(dirOrFile, file)
      const fileStat = fs.statSync(fullPath)
      if (fileStat.isFile() && file.toLowerCase().endsWith('.pdf')) {
        pdfFiles.push(fullPath)
      }
    }
    return pdfFiles
  }
  return []
}

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
  const pdfArgIndex = process.argv.findIndex(arg => arg === '--pdf')
  let chunkSize = 200
  let customText: string | null = null
  let pdfPath: string | null = null

  if (chunkArgIndex !== -1 && process.argv[chunkArgIndex + 1]) {
    const parsed = parseInt(process.argv[chunkArgIndex + 1], 10)
    if (!isNaN(parsed)) chunkSize = parsed
  } else {
    chunkSize = await promptForChunkSize(chunkSize)
  }

  if (customArgIndex !== -1 && process.argv[customArgIndex + 1]) {
    customText = process.argv[customArgIndex + 1]
  }

  if (pdfArgIndex !== -1 && process.argv[pdfArgIndex + 1]) {
    pdfPath = process.argv[pdfArgIndex + 1]
  }

  if (!process.env.DATABASE_URL2) {
    console.error('ERROR: DATABASE_URL2 env var is required')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL2,
    max: 4,
  })

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;')
  } catch (error) {
    console.error(
      'Failed to ensure pgvector extension exists on DATABASE_URL2 connection. Please enable the vector extension and retry.'
    )
    throw error
  }

  if (fresh) {
    console.log('Dropping vit_rag_chunks table for a clean reseed...')
    await pool.query('DROP TABLE IF EXISTS vit_rag_chunks;')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vit_rag_chunks (
      id uuid PRIMARY KEY,
      chunk text NOT NULL,
      metadata jsonb,
      embedding vector(3072) NOT NULL
    );
  `)

  if (customText) {
    console.log('Inserting custom chunk:', customText)
    try {
      const { embedding } = await rateLimitedAI.google.embed({
        model: { modelId: modelIds.embedding },
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
      console.log(`✅ Custom chunk inserted:`)
      console.log(`   ID: ${id}`)
      console.log(`   Length: ${customText.length} chars`)
      console.log(`   Preview: "${customText.substring(0, 100)}${customText.length > 100 ? '...' : ''}"`)
    } catch (err) {
      console.error('Error inserting custom chunk:', err)
    }
  }

  if (pdfPath) {
    const pdfFiles = await findPDFFiles(pdfPath)
    if (pdfFiles.length === 0) {
      console.error(`No PDF files found at: ${pdfPath}`)
    } else {
      console.log(`Found ${pdfFiles.length} PDF file(s) to process...`)
      
      const enc = await encoding_for_model('gpt-3.5-turbo')
      const pdfSplitter = new RecursiveCharacterTextSplitter({
        separators: ['\n## ', '\n# ', '\n\n', '\n', ' ', ''],
        chunkSize,
        chunkOverlap: 40,
        lengthFunction: text => enc.encode(text).length,
      })

      for (const pdfFile of pdfFiles) {
        console.log(`Processing PDF: ${path.basename(pdfFile)}`)
        try {
          const pdfText = await extractTextFromPDF(pdfFile)
          const pdfDocs = await pdfSplitter.createDocuments([pdfText])
          console.log(`  → ${pdfDocs.length} chunks from ${path.basename(pdfFile)}`)

          for (const [idx, doc] of pdfDocs.entries()) {
            try {
              const { embedding } = await rateLimitedAI.google.embed({
                model: { modelId: modelIds.embedding },
                value: doc.pageContent,
              })

              const id = randomUUID()
              const metadata = {
                source: 'pdf',
                filename: path.basename(pdfFile),
                filepath: pdfFile,
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
              const preview = doc.pageContent.trim().substring(0, 80).replace(/\n/g, ' ')
              console.log(`    [${idx + 1}/${pdfDocs.length}] Inserted: "${preview}${doc.pageContent.length > 80 ? '...' : ''}" (${doc.pageContent.length} chars)`)
            } catch (err) {
              console.error(`  Error on PDF chunk ${idx}:`, err)
            }
          }
          console.log(`  ✅ ${path.basename(pdfFile)} processed - ${pdfDocs.length} chunks added.`)
        } catch (err) {
          console.error(`  Error processing ${path.basename(pdfFile)}:`, err)
        }
      }
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
        model: { modelId: modelIds.embedding },
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
      const preview = doc.pageContent.trim().substring(0, 80).replace(/\n/g, ' ')
      console.log(`  [${idx + 1}/${docs.length}] Inserted: "${preview}${doc.pageContent.length > 80 ? '...' : ''}" (${doc.pageContent.length} chars)`)
    } catch (err) {
      console.error(`Error on chunk ${idx}:`, err)
    }
  }

  await pool.end()
  console.log(`\n✅ Seeding completed. Total chunks from knowledge base: ${docs.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
