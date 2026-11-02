import { NextRequest, NextResponse } from 'next/server'
import * as z from 'zod'

const translateLyricsRequestSchema = z
  .object({
    lines: z
      .array(z.object({ startTimeMs: z.union([z.string(), z.number()]), words: z.string() }))
      .optional(),
  })
  .catch({})

export async function POST(req: NextRequest) {
  const { lines } = translateLyricsRequestSchema.parse(await req.json().catch(() => ({})))
  if (!lines?.length) return NextResponse.json('', { status: 200 })
  const lrc = lines
    .map((line) => {
      const ms = typeof line.startTimeMs === 'string' ? Number(line.startTimeMs) : line.startTimeMs
      const totalMs = Number.isFinite(ms) ? ms : 0
      const minutes = Math.floor(totalMs / 60000)
      const seconds = Math.floor((totalMs % 60000) / 1000)
      const millis = Math.floor(totalMs % 1000)
      const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
        millis
      ).padStart(3, '0')}]`
      return `${timestamp}${line.words}`
    })
    .join('\n')

  return NextResponse.json(lrc)
}
