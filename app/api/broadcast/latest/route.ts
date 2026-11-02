import { NextResponse } from 'next/server'
import { getLatestBroadcast } from '@/lib/broadcast'

export const revalidate = 0

export async function GET() {
  try {
    return NextResponse.json(await getLatestBroadcast(), { status: 200 })
  } catch (error) {
    console.error('Error fetching latest broadcast:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
