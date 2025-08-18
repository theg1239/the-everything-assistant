import { getRagPool } from '@/lib/ai/knowledge-tools'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const pool = await getRagPool()
    const client = await pool.connect()
    try {
      const { rows } = await client.query(
        'SELECT id, chunk, metadata FROM vit_rag_chunks ORDER BY id'
      )
      return NextResponse.json(rows)
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('[api/knowledge] Error fetching knowledge base chunks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch knowledge base content.', details: error.message },
      { status: 500 }
    )
  }
}
